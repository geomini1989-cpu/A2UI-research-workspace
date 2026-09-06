const COMPANY_ALIASES: Record<string, string> = {
  nvidia: 'NVIDIA', nvda: 'NVIDIA', amd: 'AMD', apple: 'Apple', aapl: 'Apple',
  microsoft: 'Microsoft', msft: 'Microsoft', tesla: 'Tesla', tsla: 'Tesla',
}

export function companiesInRequest(text: string): string[] {
  const lower = text.toLowerCase()
  return [...new Set(Object.entries(COMPANY_ALIASES).filter(([key]) => lower.includes(key)).map(([, name]) => name))]
}
