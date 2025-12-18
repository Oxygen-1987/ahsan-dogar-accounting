import React from "react";
import "./LoadingSpinner.css";

const LoadingSpinner: React.FC = () => {
  return (
    <div className="spinner">
      <div className="spinner-wrapper">
        <div className="spinner-dot">
          <svg viewBox="0 0 128 128" width="50" height="50">
            <circle cx="64" cy="64" r="16" />
          </svg>
        </div>
        <div className="spinner-dot">
          <svg viewBox="0 0 128 128" width="50" height="50">
            <circle cx="64" cy="64" r="16" />
          </svg>
        </div>
        <div className="spinner-dot">
          <svg viewBox="0 0 128 128" width="50" height="50">
            <circle cx="64" cy="64" r="16" />
          </svg>
        </div>
        <div className="spinner-dot">
          <svg viewBox="0 0 128 128" width="50" height="50">
            <circle cx="64" cy="64" r="16" />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default LoadingSpinner;
