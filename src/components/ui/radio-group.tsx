"use client";

import React from 'react';

interface RadioGroupProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  children: React.ReactNode;
}

export const RadioGroup: React.FC<RadioGroupProps> = ({
  value,
  onValueChange,
  className = "",
  children
}) => {
  return (
    <div className={className} role="radiogroup">
      {children}
    </div>
  );
};

interface RadioGroupItemProps {
  value: string;
  id: string;
  className?: string;
}

export const RadioGroupItem: React.FC<RadioGroupItemProps> = ({
  value,
  id,
  className = ""
}) => {
  return (
    <input
      type="radio"
      value={value}
      id={id}
      className={`w-4 h-4 ${className}`}
    />
  );
};