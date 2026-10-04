// Reuse the exact v2 fixture; replace only the camera-study presets.
window.pitchReferenceScene.views = [40, 35, 55].flatMap(elevation => ['home', 'away'].map(end => ({
  id: `perspective-${elevation}-${end}`, label: `${elevation}° perspective · ${end} coach`,
  elevation, yaw: 0, perspective: true, end
})));
window.pitchReferenceScene.views.push(...['home', 'away'].map(end => ({
  id: `top-down-${end}`, label: `Top-down · ${end} coach`,
  elevation: 90, yaw: 0, perspective: false, end
})));
