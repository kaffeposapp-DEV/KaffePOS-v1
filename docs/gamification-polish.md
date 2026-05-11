# Gamification Polish and Celebration Effects

## Reusable Celebration Component

Implemented with:

- Host UI: `src/components/gamification/Celebration.tsx`
- Event helpers: `src/lib/celebration.ts`

- `CelebrationHost` is mounted once in `AppShell`.
- `dispatchCelebration(detail)` shows a lightweight achievement toast.
- `dispatchCelebrationOnce(key, detail)` dedupes via localStorage.
- Optional soft ding is controlled by `kpos_celebration_sound`.

Example:

```ts
dispatchCelebrationOnce(`challenge:${userId}:${challenge.id}`, {
  kind: 'challenge',
  title: challenge.title,
  message: 'Misi harian selesai.',
  points: challenge.points_reward,
  sound: isCelebrationSoundEnabled(),
});
```

## Updated Gamification Components

- Staff dashboard now has a larger level/points area.
- Level progress uses a reusable visual block.
- Streak counter uses a clean flame card.
- Badge cards are more visual and use an earned state.
- Leaderboard now shows medal icons for ranks 1, 2, and 3.
- Badge Collection uses a responsive grid.
- Progress bars use a subtle sweep animation and respect reduced-motion settings.

## Integration Points

- Challenge completion: `src/components/challenges/ChallengesPage.tsx`
- Badge earned, level up, streak: `src/components/gamification/StaffPersonalProfile.tsx`
- Kopi Score 80+ and 90+: `src/components/dashboard/AIInsightsPage.tsx`
- Loyalty reward reached: `src/components/loyalty/LoyaltyTab.tsx`

## Step-by-Step Use

1. Mount `CelebrationHost` once near the app root.
2. Call `dispatchCelebrationOnce` from any feature when an achievement is reached.
3. Use a stable key for dedupe, such as `badge:{userId}:{badgeCode}`.
4. Pass `sound: isCelebrationSoundEnabled()` for optional soft ding support.
5. Keep new achievement surfaces on existing `kaffe-panel`, `kaffe-metric-card`, white, slate, and warm orange classes.
