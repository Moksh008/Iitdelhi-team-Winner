import React, { useState, useEffect } from 'react';
import { Shield, Wifi, BatteryMedium, Signal } from 'lucide-react';

export default function MobileStatusBar({ isMonitoringActive = true, activeLanguage }) {
  const [timeStr, setTimeStr] = useState('09:41');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hrs = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      setTimeStr(`${hrs}:${mins}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mobile-status-bar" id="mobile-status-bar">
      <div className="status-left">
        <span>{timeStr}</span>
        {isMonitoringActive && (
          <div className="status-shield-indicator" title="Satark On-Device Shield Active (DPDP 2023 Compliant)">
            <Shield size={11} />
            <span>{activeLanguage?.statusShield || 'SATARK'}</span>
          </div>
        )}
      </div>

      <div className="status-right">
        <Signal size={13} />
        <Wifi size={13} />
        <BatteryMedium size={14} />
      </div>
    </div>
  );
}
