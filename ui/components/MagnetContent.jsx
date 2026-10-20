import React from 'react';
import Magnet from './Magnet.jsx';
export default function MagnetContent({ children, disabled = false, compact = false }) {
  return (
    <Magnet
      as="span"
      innerAs="span"
      withinButton
      padding={10}
      magnetStrength={10}
      maxOffset={compact ? 2 : 2.5}
      scale={1}
      tilt={0}
      spring={{ stiffness: 200, damping: 26, mass: 1 }}
      disabled={disabled}
      wrapperClassName="magnet-content"
      innerClassName="magnet-content__inner"
      style={{ display: 'inline-flex' }}
    >
      {children}
    </Magnet>
  );
}
