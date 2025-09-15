import React from 'react';
import './Spinner.css';

const Spinner: React.FC<{ size?: 'sm' | 'md' | 'lg'; style?: React.CSSProperties }> = ({ size = 'sm', style }) => {
  return <span className={`spinner ${size}`} style={style} />;
};

export default Spinner;

