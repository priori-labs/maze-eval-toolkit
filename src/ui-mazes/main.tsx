import { ThemeProvider } from '@/ui-library/context/ThemeContext'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { syncIdsFromTestSet } from './utils/mazeStorage'

// Expose sync function globally for console access
// Usage:
//   1. bun run src/cli/sync-maze-ids.ts test-sets/custom-test-set.json
//   2. In browser console: await syncMazeIds()
declare global {
  interface Window {
    syncMazeIds: () => Promise<void>
  }
}

window.syncMazeIds = async () => {
  console.log('Fetching sync-ids.json...')
  try {
    const response = await fetch('/sync-ids.json')
    if (!response.ok) {
      throw new Error(
        `Failed to fetch: ${response.status} - Run: bun run src/cli/sync-maze-ids.ts test-sets/custom-test-set.json`,
      )
    }
    const testSet = await response.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = syncIdsFromTestSet(testSet as any)
    console.log('Sync complete:')
    console.log(`  Updated: ${result.updated} mazes`)
    console.log(`  Matched: ${result.matched.length} mazes`)
    if (result.matched.length > 0) {
      console.log('  Matched mazes:')
      for (const m of result.matched) {
        console.log(`    - ${m.name}: ${m.id}`)
      }
    }
    if (result.unmatched.length > 0) {
      console.log('  Unmatched (no corresponding maze in test set):')
      for (const name of result.unmatched) {
        console.log(`    - ${name}`)
      }
    }
  } catch (error) {
    console.error('Failed to sync maze IDs:', error)
  }
}

function Root() {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ThemeProvider>
  )
}

const rootElement = document.getElementById('root')
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  )
}
