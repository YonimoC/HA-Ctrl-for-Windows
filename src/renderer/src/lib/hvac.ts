export const HVAC_LABELS: Record<string, string> = {
  off: '关闭',
  heat: '制热',
  cool: '制冷',
  heat_cool: '自动',
  auto: '自动',
  dry: '除湿',
  fan_only: '送风'
}

export const HVAC_ORDER = ['off', 'cool', 'heat', 'heat_cool', 'auto', 'dry', 'fan_only']

/** Fan-mode values vary by integration; translate the common ones, pass the rest through. */
export const FAN_LABELS: Record<string, string> = {
  auto: '自动',
  off: '关闭',
  on: '开启',
  low: '低速',
  middle: '中速',
  medium: '中速',
  high: '高速',
  silent: '静音',
  turbo: '强劲',
  focus: '专注',
  diffuse: '柔风'
}
