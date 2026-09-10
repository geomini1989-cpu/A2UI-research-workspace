import { beforeEach, describe, expect, it } from 'vitest'
import { db, recoverInterruptedRuns } from '../storage/database.js'
import { runContext, newUsage } from '../runtime/context.js'
import { claimResearchJob, finishResearchJob, getResearchJob, getResearchJobResult, saveResearchJobDraft, submitResearchJob } from './researchJobService.js'
import { researchJobFormSurface } from './researchJobUi.js'

const asOwner = <T>(ownerId: string, fn: () => T) => runContext.run({ ownerId, signal: new AbortController().signal, usage: newUsage(), mode: 'multi' }, fn)
const input = { company: 'NVIDIA', dimensions: ['financial'], depth: 'deep' }
beforeEach(() => db.exec('DELETE FROM jobs'))
describe('durable research jobs', () => {
  it('claims once, retains results and makes repeated submission idempotent', async () => {
    const job = submitResearchJob(input)
    expect(submitResearchJob({ ...input, id: job.id }).id).toBe(job.id)
    const claims = await Promise.all([Promise.resolve(claimResearchJob(job.id)), Promise.resolve(claimResearchJob(job.id))])
    expect(claims.filter(Boolean)).toHaveLength(1)
    finishResearchJob(job.id, 'COMPLETED', [{ type: 'done' }])
    expect(getResearchJobResult(job.id)).toEqual([{ type: 'done' }])
    expect(claimResearchJob(job.id)).toBeUndefined()
  })
  it('isolates owners and cannot overwrite another owner draft', () => {
    const job = asOwner('alice', () => saveResearchJobDraft(input))
    asOwner('bob', () => {
      expect(getResearchJob(job.id)).toBeUndefined()
      expect(() => saveResearchJobDraft({ ...input, id: job.id })).toThrow()
      expect(claimResearchJob(job.id)).toBeUndefined()
    })
  })
  it('recovers interrupted execution and retains server-owned form controls', () => {
    const job = submitResearchJob(input)
    claimResearchJob(job.id)
    recoverInterruptedRuns()
    expect(getResearchJob(job.id)?.status).toBe('FAILED')
    expect(claimResearchJob(job.id)?.status).toBe('RUNNING')
    const messages = researchJobFormSurface({ ...job, status: 'DRAFT' }, 'form')
    const names = messages.flatMap(message => 'updateComponents' in message ? message.updateComponents.components.map(component => component.component) : [])
    expect(names).toContain('TextField')
    expect(names).toContain('Button')
  })
})
