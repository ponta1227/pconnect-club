import type { PollView } from './polls'
import type { PollData } from '@/components/poll'
import { fmtDateTime } from './time'

export function toPollData(p: PollView): PollData {
  return {
    id: p.id,
    question: p.question,
    kind: p.kind,
    multiple: p.multiple,
    anonymous: p.anonymous,
    closesLabel: p.closes_at ? fmtDateTime(p.closes_at) : null,
    closed: p.closed,
    convertedEventId: p.converted_event_id,
    voterCount: p.voter_count,
    targetCount: p.target_count,
    hasVoted: p.has_voted,
    myVotes: p.my_votes,
    options: p.options.map((o) => ({
      id: o.id,
      label: o.starts_at ? fmtDateTime(o.starts_at) : o.label,
      yes: o.yes,
      maybe: o.maybe,
      no: o.no,
      voters: o.voters,
    })),
  }
}
