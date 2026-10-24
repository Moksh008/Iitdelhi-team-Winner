// Minimal JNI bridge to llama.cpp for Satark's on-device alert explanations.
// One model + context per handle; generation is greedy and optionally
// constrained by a GBNF grammar, with a wall-clock deadline and abort flag.

#include <jni.h>
#include <android/log.h>

#include <atomic>
#include <chrono>
#include <string>
#include <vector>

#include "llama.h"

#define LOG_TAG "SatarkLlm"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN, LOG_TAG, __VA_ARGS__)

namespace {

struct Session {
    llama_model *model = nullptr;
    llama_context *ctx = nullptr;
    std::atomic<bool> abort{false};
    std::chrono::steady_clock::time_point deadline;
};

bool abort_callback(void *data) {
    auto *session = static_cast<Session *>(data);
    return session->abort.load() || std::chrono::steady_clock::now() > session->deadline;
}

void quiet_log(enum ggml_log_level level, const char *text, void *) {
    if (level >= GGML_LOG_LEVEL_WARN) __android_log_print(ANDROID_LOG_WARN, LOG_TAG, "%s", text);
}

std::string to_string(JNIEnv *env, jstring value) {
    if (value == nullptr) return {};
    const char *chars = env->GetStringUTFChars(value, nullptr);
    std::string out(chars);
    env->ReleaseStringUTFChars(value, chars);
    return out;
}

// Returns the longest prefix of `bytes` that is complete UTF-8, so Kotlin never
// receives a split multi-byte character at the end of the output.
size_t complete_utf8_prefix(const std::string &bytes) {
    size_t i = 0, last_ok = 0;
    while (i < bytes.size()) {
        unsigned char c = bytes[i];
        size_t len = c < 0x80 ? 1 : (c >> 5) == 0x6 ? 2 : (c >> 4) == 0xE ? 3 : (c >> 3) == 0x1E ? 4 : 0;
        if (len == 0 || i + len > bytes.size()) break;
        i += len;
        last_ok = i;
    }
    return last_ok;
}

}  // namespace

extern "C" JNIEXPORT jlong JNICALL
Java_in_satark_shield_LlmEngine_nativeLoad(JNIEnv *env, jclass, jstring jpath, jint n_ctx, jint n_threads) {
    llama_log_set(quiet_log, nullptr);
    llama_backend_init();
    const std::string path = to_string(env, jpath);

    llama_model_params mparams = llama_model_default_params();
    mparams.n_gpu_layers = 0;
    // Keep weights in the memory-mapped file instead of repacking them into
    // anonymous memory: file-backed pages can be reclaimed under memory pressure,
    // which matters on 3-4 GB phones.
    mparams.use_extra_bufts = false;
    llama_model *model = llama_model_load_from_file(path.c_str(), mparams);
    if (model == nullptr) {
        LOGW("failed to load model %s", path.c_str());
        return 0;
    }

    llama_context_params cparams = llama_context_default_params();
    cparams.n_ctx = static_cast<uint32_t>(n_ctx);
    cparams.n_batch = 256;
    cparams.n_ubatch = 256;
    cparams.n_threads = n_threads;
    cparams.n_threads_batch = n_threads;
    cparams.no_perf = true;
    llama_context *ctx = llama_init_from_model(model, cparams);
    if (ctx == nullptr) {
        LOGW("failed to create context");
        llama_model_free(model);
        return 0;
    }

    auto *session = new Session();
    session->model = model;
    session->ctx = ctx;
    session->deadline = std::chrono::steady_clock::time_point::max();
    llama_set_abort_callback(ctx, abort_callback, session);
    LOGI("model loaded: ctx=%d threads=%d", n_ctx, n_threads);
    return reinterpret_cast<jlong>(session);
}

// Returns the generated UTF-8 bytes, or null on failure. If the deadline passes
// or abort is requested, generation stops and returns null.
extern "C" JNIEXPORT jbyteArray JNICALL
Java_in_satark_shield_LlmEngine_nativeGenerate(JNIEnv *env, jclass, jlong handle, jstring jprompt,
                                               jstring jgrammar, jint max_tokens, jlong timeout_ms) {
    auto *session = reinterpret_cast<Session *>(handle);
    if (session == nullptr) return nullptr;
    session->abort.store(false);
    session->deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeout_ms);

    llama_context *ctx = session->ctx;
    const llama_vocab *vocab = llama_model_get_vocab(session->model);
    llama_memory_clear(llama_get_memory(ctx), true);

    const std::string prompt = to_string(env, jprompt);
    int32_t n_prompt = -llama_tokenize(vocab, prompt.c_str(), static_cast<int32_t>(prompt.size()), nullptr, 0, true, true);
    std::vector<llama_token> tokens(n_prompt);
    if (llama_tokenize(vocab, prompt.c_str(), static_cast<int32_t>(prompt.size()), tokens.data(), n_prompt, true, true) < 0) {
        return nullptr;
    }
    if (n_prompt + max_tokens > static_cast<int32_t>(llama_n_ctx(ctx))) {
        LOGW("prompt too long: %d tokens", n_prompt);
        return nullptr;
    }

    for (int32_t start = 0; start < n_prompt; start += 256) {
        const int32_t count = std::min<int32_t>(256, n_prompt - start);
        if (llama_decode(ctx, llama_batch_get_one(tokens.data() + start, count)) != 0) return nullptr;
    }

    llama_sampler *chain = llama_sampler_chain_init(llama_sampler_chain_default_params());
    const std::string grammar = to_string(env, jgrammar);
    if (!grammar.empty()) {
        llama_sampler *g = llama_sampler_init_grammar(vocab, grammar.c_str(), "root");
        if (g == nullptr) {
            llama_sampler_free(chain);
            LOGW("grammar failed to parse");
            return nullptr;
        }
        llama_sampler_chain_add(chain, g);
    }
    llama_sampler_chain_add(chain, llama_sampler_init_greedy());

    std::string output;
    bool ok = true;
    char piece[256];
    for (int32_t i = 0; i < max_tokens; ++i) {
        if (abort_callback(session)) { ok = false; break; }
        llama_token token = llama_sampler_sample(chain, ctx, -1);
        if (llama_vocab_is_eog(vocab, token)) break;
        const int32_t n = llama_token_to_piece(vocab, token, piece, sizeof(piece), 0, false);
        if (n > 0) output.append(piece, n);
        if (llama_decode(ctx, llama_batch_get_one(&token, 1)) != 0) { ok = false; break; }
    }
    llama_sampler_free(chain);
    session->deadline = std::chrono::steady_clock::time_point::max();
    if (!ok) return nullptr;
    output.resize(complete_utf8_prefix(output));
    jbyteArray result = env->NewByteArray(static_cast<jsize>(output.size()));
    env->SetByteArrayRegion(result, 0, static_cast<jsize>(output.size()), reinterpret_cast<const jbyte *>(output.data()));
    return result;
}

extern "C" JNIEXPORT void JNICALL
Java_in_satark_shield_LlmEngine_nativeAbort(JNIEnv *, jclass, jlong handle) {
    auto *session = reinterpret_cast<Session *>(handle);
    if (session != nullptr) session->abort.store(true);
}

extern "C" JNIEXPORT void JNICALL
Java_in_satark_shield_LlmEngine_nativeFree(JNIEnv *, jclass, jlong handle) {
    auto *session = reinterpret_cast<Session *>(handle);
    if (session == nullptr) return;
    llama_free(session->ctx);
    llama_model_free(session->model);
    delete session;
}
