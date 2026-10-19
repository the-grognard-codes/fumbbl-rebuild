// Exercise the same reroll assertions with state arriving after the old 5s
// deadline and a resource icon still loading when its choice becomes visible.
delete process.env.REROLL_FIXTURE;
process.env.REROLL_MODES = 'block-single';
process.env.REROLL_READINESS_STRESS = '1';
await import('./reroll-choices-ui.mjs');
