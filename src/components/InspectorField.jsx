import React from 'react';

export default function InspectorField({ label, children, hint }) {
  return (
    <label className="inspector-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
