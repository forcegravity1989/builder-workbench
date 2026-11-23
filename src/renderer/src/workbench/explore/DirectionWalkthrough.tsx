import { DirectionRecording } from './DirectionRecording'

export function DirectionJourney() {
  return <DirectionRecording />
}
export function DirectionWall() {
  return <DirectionRecording chapters={[0]} />
}
export function DirectionOverview() {
  return <DirectionRecording chapters={[1]} />
}
export function DirectionMilestones() {
  return <DirectionRecording chapters={[2, 3]} />
}
