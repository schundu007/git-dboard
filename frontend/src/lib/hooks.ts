import { useQuery } from '@tanstack/react-query'
import { getActiveRepo } from './api'

export function useRepoSlug(): string {
  const { data } = useQuery({
    queryKey: ['active-repo'],
    queryFn: getActiveRepo,
    staleTime: 30_000,
  })
  return data?.active?.slug ?? ''
}

// Human-readable name of the active repo (e.g. "TheRock"), for section titles.
export function useActiveRepoName(): string {
  const { data } = useQuery({
    queryKey: ['active-repo'],
    queryFn: getActiveRepo,
    staleTime: 30_000,
  })
  return data?.active?.repo ?? ''
}
