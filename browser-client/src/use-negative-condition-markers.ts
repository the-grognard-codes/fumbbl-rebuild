import { useEffect, useState } from 'react';
import { readNegativeConditionMarkers, saveNegativeConditionMarkers, subscribeNegativeConditionMarkers } from './negative-condition-preferences.ts';
export function useNegativeConditionMarkers() {
  const [visible, setVisible] = useState(readNegativeConditionMarkers);
  useEffect(() => subscribeNegativeConditionMarkers(setVisible), []);
  return { visible, change: saveNegativeConditionMarkers };
}
