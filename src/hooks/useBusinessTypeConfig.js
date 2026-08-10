import { useMemo } from 'react';
import { useTenant } from '../context/TenantContext';
import { getBusinessTypeConfig } from '../lib/businessType';

/** @returns {import('../lib/businessType').BusinessTypeConfig} */
export function useBusinessTypeConfig() {
  const { businessType } = useTenant();
  return useMemo(() => getBusinessTypeConfig(businessType), [businessType]);
}
