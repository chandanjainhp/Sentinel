import React from 'react';
import dynamic from 'next/dynamic';
import argusScanning from '../assets/argus-scanning.json';

const Lottie = dynamic(() => import('lottie-react'), { ssr: false });

export default function LoadingBriefing() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '64px 24px',
      background: 'var(--bg-surface-1)',
      border: '1px solid var(--border-default)',
      borderRadius: '2px',
      textAlign: 'center',
      marginBottom: '24px'
    }}>
      <div style={{ width: 120, height: 120, marginBottom: '24px' }}>
        <Lottie animationData={argusScanning} loop={true} />
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        color: 'var(--accent)',
        marginBottom: '8px'
      }}>
        Argus is analyzing
      </div>
      <div style={{
        fontFamily: 'var(--font-sans)',
        fontSize: '16px',
        color: 'var(--fg-1)'
      }}>
        Generating morning briefing...
      </div>
    </div>
  );
}
