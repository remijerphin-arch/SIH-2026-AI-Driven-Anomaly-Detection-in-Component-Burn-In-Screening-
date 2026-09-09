export const PARAMETERS = [
  { key: 'leakage_current', label: 'Leakage Current', unit: 'µA' },
  { key: 'voltage', label: 'Voltage', unit: 'V' },
  { key: 'current', label: 'Current', unit: 'mA' },
  { key: 'temperature', label: 'Temperature', unit: '°C' },
  { key: 'pressure', label: 'Pressure', unit: 'kPa' },
  { key: 'vibration', label: 'Vibration', unit: 'g' },
  { key: 'propagation_delay', label: 'Propagation Delay', unit: 'ns' },
  { key: 'resistance', label: 'Resistance', unit: 'Ω' },
  { key: 'capacitance', label: 'Capacitance', unit: 'pF' },
] as const

export type ParamKey = (typeof PARAMETERS)[number]['key']

export const chartTip = {
  background: '#121a2b',
  border: '1px solid #243049',
  color: '#e8eef6',
  fontSize: 12,
}
