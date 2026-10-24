import { useEffect, useState } from 'react';
import { readLimitedActionTags, saveLimitedActionTags, subscribeLimitedActionTags } from './limited-action-preferences.ts';
export function useLimitedActionTags() {
  const [visible, setVisible] = useState(readLimitedActionTags);
  useEffect(() => subscribeLimitedActionTags(setVisible), []);
  return { visible, change: saveLimitedActionTags };
}
