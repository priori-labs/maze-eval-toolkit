import { useCallback, useEffect, useState } from 'react'
import type { TestSetFile } from '../../core/types'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui'

interface HumanEvalSetupProps {
  onStart: (runName: string, testSet: TestSetFile) => void
  onCancel: () => void
}

export default function HumanEvalSetup({ onStart, onCancel }: HumanEvalSetupProps) {
  const [runName, setRunName] = useState('')
  const [dataFiles, setDataFiles] = useState<string[]>([])
  const [selectedFile, setSelectedFile] = useState('')
  const [testSet, setTestSet] = useState<TestSetFile | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Fetch available test set files
  useEffect(() => {
    fetch('/api/data')
      .then((r) => r.json())
      .then((d: { files: string[] }) => setDataFiles(d.files))
      .catch(() => setDataFiles([]))
  }, [])

  // Load test set when file is selected
  const handleFileSelect = useCallback(async (filename: string) => {
    setSelectedFile(filename)
    setIsLoading(true)
    try {
      const response = await fetch(`/api/data/${filename}`)
      if (!response.ok) throw new Error('Failed to fetch')
      const data = (await response.json()) as TestSetFile
      setTestSet(data)
    } catch (err) {
      alert(`Failed to load test set: ${err}`)
      setTestSet(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Calculate total mazes
  const totalMazes = testSet?.summary?.totalMazes ?? 0

  // Can start evaluation?
  const canStart = runName.trim().length > 0 && testSet !== null

  const handleStart = () => {
    if (canStart && testSet) {
      onStart(runName.trim(), testSet)
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Human Evaluation Setup</CardTitle>
          <CardDescription>Configure your evaluation run before starting</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Run Name */}
          <div className="space-y-2">
            <Label htmlFor="run-name">Run Name</Label>
            <Input
              id="run-name"
              placeholder="e.g., Sean - First Attempt"
              value={runName}
              onChange={(e) => setRunName(e.target.value)}
            />
          </div>

          {/* Test Set Selection */}
          <div className="space-y-2">
            <Label>Test Set</Label>
            <Select value={selectedFile} onValueChange={handleFileSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Select a test set..." />
              </SelectTrigger>
              <SelectContent>
                {dataFiles.length === 0 ? (
                  <SelectItem value="_none" disabled>
                    No test sets found
                  </SelectItem>
                ) : (
                  dataFiles.map((file) => (
                    <SelectItem key={file} value={file}>
                      {file}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Test Set Preview */}
          {testSet && (
            <div className="rounded-lg border border-border p-4 bg-muted/50">
              <p className="font-medium">{testSet.name}</p>
              <p className="text-sm text-muted-foreground mt-1">{totalMazes} mazes total</p>
              <div className="text-sm text-muted-foreground mt-2 space-y-1">
                {Object.entries(testSet.summary.byDifficulty).map(([diff, count]) => (
                  <div key={diff} className="flex justify-between">
                    <span className="capitalize">{diff}</span>
                    <span>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isLoading && <p className="text-sm text-muted-foreground">Loading test set...</p>}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={onCancel} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleStart} disabled={!canStart} className="flex-1">
              Start Evaluation
            </Button>
          </div>

          {/* Instructions */}
          <div className="text-sm text-muted-foreground border-t border-border pt-4">
            <p className="font-medium mb-2">How it works:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Mazes appear in random order (all difficulties mixed)</li>
              <li>Press SPACE to reveal each maze and start timer</li>
              <li>Use arrow keys to navigate to the goal</li>
              <li>Press ENTER to proceed to next maze</li>
              <li>Complete all {totalMazes || 'N'} mazes to finish</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
