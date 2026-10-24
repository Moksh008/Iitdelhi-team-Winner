cmake_minimum_required(VERSION 3.22.1)
project("satark_llm" C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Inference at -O0 is unusably slow, so optimise even in Gradle debug builds.
set(CMAKE_BUILD_TYPE Release CACHE STRING "" FORCE)

# llama.cpp, pinned to a release tarball and verified by SHA-256 (MIT licence).
include(FetchContent)
FetchContent_Declare(
    llama_cpp
    URL https://github.com/ggml-org/llama.cpp/archive/refs/tags/v0.7.0.tar.gz
    URL_HASH SHA256=55d67acf3ad2ad747a9bbeb75f9f0e173dbcc0d1753a471038a90c819421c5e1
)

# Library only: no tools, server, tests, examples, network or OpenSSL.
set(LLAMA_BUILD_COMMON OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TOOLS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_APP OFF CACHE BOOL "" FORCE)
set(LLAMA_OPENSSL OFF CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
# Baseline ARMv8 so the same build runs on older Cortex-A53 phones.
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)
set(GGML_CPU_KLEIDIAI OFF CACHE BOOL "" FORCE)
set(GGML_LLAMAFILE OFF CACHE BOOL "" FORCE)

FetchContent_MakeAvailable(llama_cpp)

add_library(satark_llm SHARED satark_llm.cpp)
target_link_libraries(satark_llm PRIVATE llama ggml android log)
target_compile_options(satark_llm PRIVATE -O2)
# Android 15+ devices can use 16 KB memory pages; align segments so the library loads natively.
target_link_options(satark_llm PRIVATE "-Wl,-z,max-page-size=16384")
