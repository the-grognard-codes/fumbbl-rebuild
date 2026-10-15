import { PolygonDie } from './PolygonDie.tsx';
import type { PolygonDieProps } from './PolygonDie.tsx';

/** Compatibility adapter for the native block preview and choice surfaces. */
export function BlockDie(props: Omit<PolygonDieProps, 'kind'>) {
  return <PolygonDie {...props} kind="block"/>;
}
