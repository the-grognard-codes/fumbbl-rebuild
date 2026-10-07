const weatherConditions: Record<string, { label: string; sprite: string }> = {
  NICE: { label: 'Nice', sprite: 'nice' },
  VERY_SUNNY: { label: 'Sunny', sprite: 'sunny' },
  SWELTERING_HEAT: { label: 'Heat', sprite: 'heat' },
  POURING_RAIN: { label: 'Rain', sprite: 'rain' },
  BLIZZARD: { label: 'Blizzard', sprite: 'blizzard' }
};

export function weatherPresentation(weather: string) {
  const key = weather.trim().toUpperCase().replace(/\s+/g, '_');
  return weatherConditions[key === 'NICE_WEATHER' ? 'NICE' : key]
    ?? { label: weather.trim().replace(/_/g, ' ') || 'Weather unavailable', sprite: null };
}
