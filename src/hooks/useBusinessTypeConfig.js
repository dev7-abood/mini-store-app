import { useMemo } from 'react';
import { useTenant } from '../context/TenantContext';
import { getBusinessTypeConfig } from '../lib/businessType';

/** @returns {import('../lib/businessType').BusinessTypeConfig} */
export function useBusinessTypeConfig() {
  const { businessType } = useTenant();
  const config = useMemo(
    () => (businessType ? getBusinessTypeConfig(businessType) : null),
    [businessType],
  );
  if (!config) {
    throw new Error('useBusinessTypeConfig requires an initialized tenant business_type.');
  }
  return config;
}
