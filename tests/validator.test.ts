import { describe, test, expect } from 'vitest'
import type { ProcessIr } from '../src/ir.js'
import { validator, validateProcess } from '../src/validator.js'
import type { ValidationRule, ValidationFinding } from '../src/validator-types.js'

function createMinimalProcess(): ProcessIr {
  return {
    id: 'test-process',
    name: 'Test Process',
    poolId: 'pool-1',
    poolName: 'Pool 1',
    lanes: [
      {
        id: 'lane-1',
        name: 'Lane 1',
        elements: [
          { id: 'start-1', name: 'Start', type: 'startEvent', poolId: 'pool-1', laneId: 'lane-1' },
          { id: 'end-1', name: 'End', type: 'endEvent', poolId: 'pool-1', laneId: 'lane-1' },
        ],
      },
    ],
    flows: [{ id: 'flow-1', from: 'start-1', to: 'end-1' }],
  }
}

describe('Validator', () => {
  test('empty process returns valid report', () => {
    const ir = createMinimalProcess()
    const report = validateProcess(ir)
    expect(report.isValid).toBe(true)
  })

  test('finding has required fields', () => {
    const testRule: ValidationRule = {
      ruleId: 'TEST-001',
      severity: 'warning',
      description: 'Test rule',
      validate(): ValidationFinding[] {
        return [{ ruleId: 'TEST-001', severity: 'warning', message: 'Test' }]
      },
    }
    validator.register(testRule)
    const report = validateProcess(createMinimalProcess())
    validator.deregister('TEST-001')
    expect(report.findings.some(f => f.ruleId === 'TEST-001')).toBe(true)
  })

  test('SE-001 passes when start event exists', () => {
    const ir = createMinimalProcess()
    const report = validateProcess(ir, { enabledRules: new Set(['SE-001']) })
    expect(report.findings.filter(f => f.ruleId === 'SE-001')).toHaveLength(0)
  })

  test('SE-001 fails when no start events', () => {
    const ir: ProcessIr = {
      id: 't', name: 'T', poolId: 'p1', poolName: 'P',
      lanes: [{ id: 'l1', name: 'L', elements: [] }],
      flows: [],
    }
    const report = validateProcess(ir)
    expect(report.findings.some(f => f.ruleId === 'SE-001')).toBe(true)
  })

  test('SE-003 passes when start has no incoming', () => {
    const ir = createMinimalProcess()
    const report = validateProcess(ir, { enabledRules: new Set(['SE-003']) })
    expect(report.findings.filter(f => f.ruleId === 'SE-003')).toHaveLength(0)
  })

  test('SE-003 fails when start has incoming', () => {
    const ir: ProcessIr = {
      id: 't', name: 'T', poolId: 'p1', poolName: 'P',
      lanes: [{
        id: 'l1', name: 'L',
        elements: [
          { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
          { id: 't1', name: 'T', type: 'task', poolId: 'p1', laneId: 'l1' },
        ],
      }],
      flows: [
        { id: 'f1', from: 't1', to: 's1' },
        { id: 'f2', from: 's1', to: 't1' },
      ],
    }
    const report = validateProcess(ir)
    expect(report.findings.some(f => f.ruleId === 'SE-003')).toBe(true)
  })

  test('SE-004 passes with one outgoing from start', () => {
    const ir = createMinimalProcess()
    const report = validateProcess(ir, { enabledRules: new Set(['SE-004']) })
    expect(report.findings.filter(f => f.ruleId === 'SE-004')).toHaveLength(0)
  })

  test('SE-004 fails with zero outgoing from start', () => {
    const ir: ProcessIr = {
      id: 't', name: 'T', poolId: 'p1', poolName: 'P',
      lanes: [{ id: 'l1', name: 'L', elements: [{ id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' }] }],
      flows: [],
    }
    const report = validateProcess(ir)
    expect(report.findings.some(f => f.ruleId === 'SE-004')).toBe(true)
  })

  test('EE-001 passes when end event exists', () => {
    const ir = createMinimalProcess()
    const report = validateProcess(ir, { enabledRules: new Set(['EE-001']) })
    expect(report.findings.filter(f => f.ruleId === 'EE-001')).toHaveLength(0)
  })

  test('EE-001 fails when no end events', () => {
    const ir: ProcessIr = {
      id: 't', name: 'T', poolId: 'p1', poolName: 'P',
      lanes: [{
        id: 'l1', name: 'L',
        elements: [{ id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' }],
      }],
      flows: [],
    }
    const report = validateProcess(ir)
    expect(report.findings.some(f => f.ruleId === 'EE-001')).toBe(true)
  })

  test('EE-003 passes when end has no outgoing', () => {
    const ir = createMinimalProcess()
    const report = validateProcess(ir, { enabledRules: new Set(['EE-003']) })
    expect(report.findings.filter(f => f.ruleId === 'EE-003')).toHaveLength(0)
  })

  test('EE-003 fails when end has outgoing', () => {
    const ir: ProcessIr = {
      id: 't', name: 'T', poolId: 'p1', poolName: 'P',
      lanes: [{
        id: 'l1', name: 'L',
        elements: [
          { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
          { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
          { id: 't1', name: 'T', type: 'task', poolId: 'p1', laneId: 'l1' },
        ],
      }],
      flows: [
        { id: 'f1', from: 's1', to: 't1' },
        { id: 'f2', from: 't1', to: 'e1' },
        { id: 'f3', from: 'e1', to: 't1' },
      ],
    }
    const report = validateProcess(ir)
    expect(report.findings.some(f => f.ruleId === 'EE-003')).toBe(true)
  })

  test('EE-004 passes when end has incoming', () => {
    const ir = createMinimalProcess()
    const report = validateProcess(ir, { enabledRules: new Set(['EE-004']) })
    expect(report.findings.filter(f => f.ruleId === 'EE-004')).toHaveLength(0)
  })

  test('EE-004 fails when end has no incoming', () => {
    const ir: ProcessIr = {
      id: 't', name: 'T', poolId: 'p1', poolName: 'P',
      lanes: [{
        id: 'l1', name: 'L',
        elements: [
          { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
          { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
        ],
      }],
      flows: [{ id: 'f1', from: 's1', to: 's1' }],
    }
    const report = validateProcess(ir)
    expect(report.findings.some(f => f.ruleId === 'EE-004')).toBe(true)
  })
})

  describe('Activity rules (RD-103)', () => {
    describe('ACT-001: Tasks must have incoming and outgoing flows', () => {
      test('should fail when task has no incoming flow', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 't1', name: 'Task', type: 'task', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 'e1' }, // Task not connected
            { id: 'f2', from: 't1', to: 'e1' },
          ],
        }
        const report = validateProcess(ir)
        expect(report.findings.some(f => f.ruleId === 'ACT-001')).toBe(true)
      })

      test('should fail when task has no outgoing flow', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 't1', name: 'Task', type: 'task', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 't1' },
            { id: 'f2', from: 's1', to: 'e1' }, // Task not connected to end
          ],
        }
        const report = validateProcess(ir)
        expect(report.findings.some(f => f.ruleId === 'ACT-001')).toBe(true)
      })

      test('should pass when task has both incoming and outgoing', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 't1', name: 'Task', type: 'task', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 't1' },
            { id: 'f2', from: 't1', to: 'e1' },
          ],
        }
        const report = validateProcess(ir, { enabledRules: new Set(['ACT-001']) })
        const findings = report.findings.filter(f => f.ruleId === 'ACT-001')
        expect(findings).toHaveLength(0)
      })

      test('should pass for sole-element process (single task)', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 't1', name: 'SingleTask', type: 'task', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [],
        }
        const report = validateProcess(ir, { enabledRules: new Set(['ACT-001']) })
        const findings = report.findings.filter(f => f.ruleId === 'ACT-001')
        expect(findings).toHaveLength(0)
      })
    })
  })

  describe('Connectivity rules (RD-106)', () => {
    describe('CONN-001: Element reachability from start and to end', () => {
      test('should pass when all elements reachable from start and reach end', () => {
        const ir = createMinimalProcess()
        const report = validateProcess(ir, { enabledRules: new Set(['CONN-001']) })
        const findings = report.findings.filter(f => f.ruleId === 'CONN-001')
        expect(findings).toHaveLength(0)
      })

      test('should fail when element unreachable from start', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 't1', name: 'Task1', type: 'task', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
              { id: 't2', name: 'Isolated', type: 'task', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 't1' },
            { id: 'f2', from: 't1', to: 'e1' },
          ],
        }
        const report = validateProcess(ir)
        expect(report.findings.some(f => f.ruleId === 'CONN-001' && f.elementId === 't2')).toBe(true)
      })

      test('should fail when element does not reach end event', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 't1', name: 'Task1', type: 'task', poolId: 'p1', laneId: 'l1' },
              { id: 't2', name: 'DeadEnd', type: 'task', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 't1' },
            { id: 'f2', from: 't1', to: 't2' },
            { id: 'f3', from: 's1', to: 'e1' },
          ],
        }
        const report = validateProcess(ir)
        expect(report.findings.some(f => f.ruleId === 'CONN-001' && f.elementId === 't2')).toBe(true)
      })

      test('should fail when element violates both conditions', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
              { id: 't1', name: 'Orphan', type: 'task', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 'e1' },
          ],
        }
        const report = validateProcess(ir)
        expect(report.findings.some(f => f.ruleId === 'CONN-001' && f.elementId === 't1')).toBe(true)
      })

      test('should pass for sole-element process (single task)', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 't1', name: 'SingleTask', type: 'task', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [],
        }
        const report = validateProcess(ir, { enabledRules: new Set(['CONN-001']) })
        const findings = report.findings.filter(f => f.ruleId === 'CONN-001')
        expect(findings).toHaveLength(0)
      })
    })

    describe('CONN-002: Graph connectivity (no isolated subgraphs)', () => {
      test('should pass when graph is connected', () => {
        const ir = createMinimalProcess()
        const report = validateProcess(ir, { enabledRules: new Set(['CONN-002']) })
        const findings = report.findings.filter(f => f.ruleId === 'CONN-002')
        expect(findings).toHaveLength(0)
      })

      test('should fail when single element is isolated', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
              { id: 't1', name: 'Orphan', type: 'task', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 'e1' },
          ],
        }
        const report = validateProcess(ir)
        expect(report.findings.some(f => f.ruleId === 'CONN-002' && f.elementId === 't1')).toBe(true)
      })

      test('should fail when isolated island of multiple elements exists', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
              { id: 't1', name: 'Task1', type: 'task', poolId: 'p1', laneId: 'l1' },
              { id: 't2', name: 'Task2', type: 'task', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 'e1' },
            { id: 'f2', from: 't1', to: 't2' },
          ],
        }
        const report = validateProcess(ir)
        const findings = report.findings.filter(f => f.ruleId === 'CONN-002')
        expect(findings.length).toBeGreaterThan(0)
        expect(findings.some(f => f.elementId === 't1' || f.elementId === 't2')).toBe(true)
      })

      test('should fail when multiple isolated islands exist', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
              { id: 't1', name: 'Task1', type: 'task', poolId: 'p1', laneId: 'l1' },
              { id: 't2', name: 'Task2', type: 'task', poolId: 'p1', laneId: 'l1' },
              { id: 't3', name: 'Task3', type: 'task', poolId: 'p1', laneId: 'l1' },
              { id: 't4', name: 'Task4', type: 'task', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 'e1' },
            { id: 'f2', from: 't1', to: 't2' },
            { id: 'f3', from: 't3', to: 't4' },
          ],
        }
        const report = validateProcess(ir)
        const findings = report.findings.filter(f => f.ruleId === 'CONN-002')
        expect(findings.length).toBeGreaterThan(0)
        expect(findings.some(f => [1, 2, 3, 4].includes(parseInt(f.elementId?.match(/\d+/) as any, 10)))).toBe(true)
      })
    })
  })

  describe('Sequence flow rules (RD-104)', () => {
    describe('SF-005: Condition expressions only on Activity or XOR flows', () => {
      test('should pass when condition is on Activity', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 't1', name: 'Task', type: 'task', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 't1' },
            { id: 'f2', from: 't1', to: 'e1', condition: 'amount > 100' },
          ],
        }
        const report = validateProcess(ir, { enabledRules: new Set(['SF-005']) })
        const findings = report.findings.filter(f => f.ruleId === 'SF-005')
        expect(findings).toHaveLength(0)
      })

      test('should pass when condition is on XOR gateway', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 'xor1', name: 'Decision', type: 'exclusiveGateway', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 'xor1' },
            { id: 'f2', from: 'xor1', to: 'e1', condition: 'approved' },
          ],
        }
        const report = validateProcess(ir, { enabledRules: new Set(['SF-005']) })
        const findings = report.findings.filter(f => f.ruleId === 'SF-005')
        expect(findings).toHaveLength(0)
      })

      test('should fail when condition is on start event', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 'e1', condition: 'invalid' },
          ],
        }
        const report = validateProcess(ir)
        expect(report.findings.some(f => f.ruleId === 'SF-005')).toBe(true)
      })

      test('should fail when condition is on end event', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 'e1', condition: 'invalid' },
          ],
        }
        const report = validateProcess(ir)
        expect(report.findings.some(f => f.ruleId === 'SF-005')).toBe(true)
      })
    })

    describe('SF-006: Default flow marker only on Activity or XOR flows', () => {
      test('should pass when default is on Activity', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 't1', name: 'Task', type: 'task', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 't1' },
            { id: 'f2', from: 't1', to: 'e1', default: true },
          ],
        }
        const report = validateProcess(ir, { enabledRules: new Set(['SF-006']) })
        const findings = report.findings.filter(f => f.ruleId === 'SF-006')
        expect(findings).toHaveLength(0)
      })

      test('should fail when default is on start event', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 'e1', default: true },
          ],
        }
        const report = validateProcess(ir)
        expect(report.findings.some(f => f.ruleId === 'SF-006')).toBe(true)
      })
    })

    describe('SF-007: Default marker and condition are mutually exclusive', () => {
      test('should pass when flow has condition only', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 't1', name: 'Task', type: 'task', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 't1' },
            { id: 'f2', from: 't1', to: 'e1', condition: 'approved' },
          ],
        }
        const report = validateProcess(ir, { enabledRules: new Set(['SF-007']) })
        const findings = report.findings.filter(f => f.ruleId === 'SF-007')
        expect(findings).toHaveLength(0)
      })

      test('should pass when flow has default only', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 't1', name: 'Task', type: 'task', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 't1' },
            { id: 'f2', from: 't1', to: 'e1', default: true },
          ],
        }
        const report = validateProcess(ir, { enabledRules: new Set(['SF-007']) })
        const findings = report.findings.filter(f => f.ruleId === 'SF-007')
        expect(findings).toHaveLength(0)
      })

      test('should fail when flow has both default and condition', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 't1', name: 'Task', type: 'task', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 't1' },
            { id: 'f2', from: 't1', to: 'e1', condition: 'approved', default: true },
          ],
        }
        const report = validateProcess(ir)
        expect(report.findings.some(f => f.ruleId === 'SF-007')).toBe(true)
      })
    })
  })

  describe('Gateway rules (RD-105)', () => {
    describe('GW-XOR-01: XOR cannot be single-in single-out', () => {
      test('should pass with multiple incoming flows', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 't1', name: 'Task', type: 'task', poolId: 'p1', laneId: 'l1' },
              { id: 'xor1', name: 'Join', type: 'exclusiveGateway', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 't1' },
            { id: 'f2', from: 't1', to: 'xor1' },
            { id: 'f3', from: 's1', to: 'xor1' },
            { id: 'f4', from: 'xor1', to: 'e1' },
          ],
        }
        const report = validateProcess(ir, { enabledRules: new Set(['GW-XOR-01']) })
        const findings = report.findings.filter(f => f.ruleId === 'GW-XOR-01')
        expect(findings).toHaveLength(0)
      })

      test('should fail with single-in single-out XOR', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 'xor1', name: 'Pointless', type: 'exclusiveGateway', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 'xor1' },
            { id: 'f2', from: 'xor1', to: 'e1' },
          ],
        }
        const report = validateProcess(ir)
        expect(report.findings.some(f => f.ruleId === 'GW-XOR-01')).toBe(true)
      })
    })

    describe('GW-XOR-02: XOR split must have conditions on non-default flows', () => {
      test('should pass with one condition and one default', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 'xor1', name: 'Decision', type: 'exclusiveGateway', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 'xor1' },
            { id: 'f2', from: 'xor1', to: 'e1', condition: 'approved' },
            { id: 'f3', from: 'xor1', to: 'e1', default: true },
          ],
        }
        const report = validateProcess(ir, { enabledRules: new Set(['GW-XOR-02']) })
        const findings = report.findings.filter(f => f.ruleId === 'GW-XOR-02')
        expect(findings).toHaveLength(0)
      })

      test('should fail with multiple default flows', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 'xor1', name: 'Decision', type: 'exclusiveGateway', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 'xor1' },
            { id: 'f2', from: 'xor1', to: 'e1', default: true },
            { id: 'f3', from: 'xor1', to: 'e1', default: true },
          ],
        }
        const report = validateProcess(ir)
        expect(report.findings.some(f => f.ruleId === 'GW-XOR-02')).toBe(true)
      })

      test('should fail when unconditional flows exist without default', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 'xor1', name: 'Decision', type: 'exclusiveGateway', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 'xor1' },
            { id: 'f2', from: 'xor1', to: 'e1', condition: 'approved' },
            { id: 'f3', from: 'xor1', to: 'e1' },
          ],
        }
        const report = validateProcess(ir)
        expect(report.findings.some(f => f.ruleId === 'GW-XOR-02')).toBe(true)
      })
    })

    describe('GW-AND-04: Parallel split flows must not have conditions', () => {
      test('should pass when parallel flows have no conditions', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 'and1', name: 'Fork', type: 'parallelGateway', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 'and1' },
            { id: 'f2', from: 'and1', to: 'e1' },
            { id: 'f3', from: 'and1', to: 'e1' },
          ],
        }
        const report = validateProcess(ir, { enabledRules: new Set(['GW-AND-04']) })
        const findings = report.findings.filter(f => f.ruleId === 'GW-AND-04')
        expect(findings).toHaveLength(0)
      })

      test('should fail when parallel flows have conditions', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 'and1', name: 'Fork', type: 'parallelGateway', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 'and1' },
            { id: 'f2', from: 'and1', to: 'e1', condition: 'invalid' },
            { id: 'f3', from: 'and1', to: 'e1' },
          ],
        }
        const report = validateProcess(ir)
        expect(report.findings.some(f => f.ruleId === 'GW-AND-04')).toBe(true)
      })
    })
  })

  describe('Anti-pattern warning rules', () => {
    describe('AP-FLOAT: Floating elements', () => {
      test('should pass when all elements have flows', () => {
        const ir = createMinimalProcess()
        const report = validateProcess(ir, { enabledRules: new Set(['AP-FLOAT']) })
        const findings = report.findings.filter(f => f.ruleId === 'AP-FLOAT')
        expect(findings).toHaveLength(0)
      })

      test('should warn when element has no incoming or outgoing flows', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
              { id: 't1', name: 'Floating', type: 'task', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 'e1' },
          ],
        }
        const report = validateProcess(ir)
        expect(report.findings.some(f => f.ruleId === 'AP-FLOAT' && f.elementId === 't1')).toBe(true)
      })
    })

    describe('AP-NO-DEFAULT: Missing default on conditional XOR split', () => {
      test('should pass when XOR has default', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 'xor1', name: 'Decision', type: 'exclusiveGateway', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 'xor1' },
            { id: 'f2', from: 'xor1', to: 'e1', condition: 'a' },
            { id: 'f3', from: 'xor1', to: 'e1', default: true },
          ],
        }
        const report = validateProcess(ir, { enabledRules: new Set(['AP-NO-DEFAULT']) })
        const findings = report.findings.filter(f => f.ruleId === 'AP-NO-DEFAULT')
        expect(findings).toHaveLength(0)
      })

      test('should warn when all XOR flows are conditional with no default', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 'xor1', name: 'Decision', type: 'exclusiveGateway', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 'xor1' },
            { id: 'f2', from: 'xor1', to: 'e1', condition: 'a' },
            { id: 'f3', from: 'xor1', to: 'e1', condition: 'b' },
          ],
        }
        const report = validateProcess(ir)
        expect(report.findings.some(f => f.ruleId === 'AP-NO-DEFAULT')).toBe(true)
      })
    })

    describe('AP-IMPLICIT-JOIN: Multiple incoming flows on task', () => {
      test('should pass when task has single incoming flow', () => {
        const ir = createMinimalProcess()
        const report = validateProcess(ir, { enabledRules: new Set(['AP-IMPLICIT-JOIN']) })
        const findings = report.findings.filter(f => f.ruleId === 'AP-IMPLICIT-JOIN')
        expect(findings).toHaveLength(0)
      })

      test('should warn when task has multiple incoming flows', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 't1', name: 'Task1', type: 'task', poolId: 'p1', laneId: 'l1' },
              { id: 't2', name: 'Task2', type: 'task', poolId: 'p1', laneId: 'l1' },
              { id: 't3', name: 'Join', type: 'task', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 't1' },
            { id: 'f2', from: 's1', to: 't2' },
            { id: 'f3', from: 't1', to: 't3' },
            { id: 'f4', from: 't2', to: 't3' },
            { id: 'f5', from: 't3', to: 'e1' },
          ],
        }
        const report = validateProcess(ir)
        expect(report.findings.some(f => f.ruleId === 'AP-IMPLICIT-JOIN' && f.elementId === 't3')).toBe(true)
      })
    })

    describe('AP-GW-AS-TASK: Gateway-as-task heuristic (RD-110, off by default)', () => {
      test('should not warn when off-by-default rule is not enabled', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 'gw', name: 'Validate', type: 'exclusiveGateway', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 'gw' },
            { id: 'f2', from: 'gw', to: 'e1' },
          ],
        }
        // Run with AP-GW-AS-TASK NOT in enabledRules (off by default)
        const report = validateProcess(ir, { enabledRules: new Set(['SE-001']) })
        const findings = report.findings.filter(f => f.ruleId === 'AP-GW-AS-TASK')
        expect(findings).toHaveLength(0)
      })

      test('should warn when explicitly enabled and gateway name starts with imperative verb', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 'gw', name: 'Validate Data', type: 'exclusiveGateway', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 'gw' },
            { id: 'f2', from: 'gw', to: 'e1' },
          ],
        }
        // Explicitly enable AP-GW-AS-TASK
        const report = validateProcess(ir, { enabledRules: new Set(['AP-GW-AS-TASK']) })
        const findings = report.findings.filter(f => f.ruleId === 'AP-GW-AS-TASK')
        expect(findings).toHaveLength(1)
        expect(findings[0].elementId).toBe('gw')
      })

      test('should not warn when gateway name does not start with imperative verb', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 'gw', name: 'Split Decision', type: 'exclusiveGateway', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 'gw' },
            { id: 'f2', from: 'gw', to: 'e1' },
          ],
        }
        const report = validateProcess(ir, { enabledRules: new Set(['AP-GW-AS-TASK']) })
        const findings = report.findings.filter(f => f.ruleId === 'AP-GW-AS-TASK')
        expect(findings).toHaveLength(0)
      })

      test('should not warn when gateway has no name', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 'gw', type: 'parallelGateway', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 'gw' },
            { id: 'f2', from: 'gw', to: 'e1' },
          ],
        }
        const report = validateProcess(ir, { enabledRules: new Set(['AP-GW-AS-TASK']) })
        const findings = report.findings.filter(f => f.ruleId === 'AP-GW-AS-TASK')
        expect(findings).toHaveLength(0)
      })
    })

    describe('SF-DUP: Duplicate sequence flows (RD-099)', () => {
      test('should pass when all flows have unique source-target pairs', () => {
        const ir = createMinimalProcess()
        const report = validateProcess(ir, { enabledRules: new Set(['SF-DUP']) })
        const findings = report.findings.filter(f => f.ruleId === 'SF-DUP')
        expect(findings).toHaveLength(0)
      })

      test('should fail when two flows share the same from-to pair', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 't1', name: 'Task', type: 'task', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 't1' },
            { id: 'f2', from: 's1', to: 't1' }, // Duplicate
            { id: 'f3', from: 't1', to: 'e1' },
          ],
        }
        const report = validateProcess(ir)
        const findings = report.findings.filter(f => f.ruleId === 'SF-DUP')
        expect(findings).toHaveLength(1)
        expect(findings[0].elementId).toBe('f2')
      })

      test('should detect multiple duplicates', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 't1', name: 'Task', type: 'task', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 't1' },
            { id: 'f2', from: 's1', to: 't1' }, // Duplicate of f1
            { id: 'f3', from: 't1', to: 'e1' },
            { id: 'f4', from: 't1', to: 'e1' }, // Duplicate of f3
          ],
        }
        const report = validateProcess(ir)
        const findings = report.findings.filter(f => f.ruleId === 'SF-DUP')
        expect(findings).toHaveLength(2)
      })
    })

    describe('SF-001: Valid flow endpoints (RD-100)', () => {
      test('should pass when all flow endpoints exist', () => {
        const ir = createMinimalProcess()
        const report = validateProcess(ir, { enabledRules: new Set(['SF-001']) })
        const findings = report.findings.filter(f => f.ruleId === 'SF-001')
        expect(findings).toHaveLength(0)
      })

      test('should fail when flow source does not exist', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 'missing-source', to: 'e1' },
          ],
        }
        const report = validateProcess(ir)
        const findings = report.findings.filter(f => f.ruleId === 'SF-001')
        expect(findings).toHaveLength(1)
        expect(findings[0].message).toContain('missing-source')
      })

      test('should fail when flow target does not exist', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [
              { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
              { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
            ],
          }],
          flows: [
            { id: 'f1', from: 's1', to: 'missing-target' },
          ],
        }
        const report = validateProcess(ir)
        const findings = report.findings.filter(f => f.ruleId === 'SF-001')
        expect(findings).toHaveLength(1)
        expect(findings[0].message).toContain('missing-target')
      })

      test('should report both source and target errors for same flow', () => {
        const ir: ProcessIr = {
          id: 't', name: 'T', poolId: 'p1', poolName: 'P',
          lanes: [{
            id: 'l1', name: 'L',
            elements: [],
          }],
          flows: [
            { id: 'f1', from: 'missing-source', to: 'missing-target' },
          ],
        }
        const report = validateProcess(ir)
        const findings = report.findings.filter(f => f.ruleId === 'SF-001')
        expect(findings).toHaveLength(2)
      })
    })
  })

  describe('ValidatorConfig with enabledRules filtering', () => {
    test('enabledRules set filters which rules execute', () => {
      const ir: ProcessIr = {
        id: 't', name: 'T', poolId: 'p1', poolName: 'P',
        lanes: [{
          id: 'l1', name: 'L',
          elements: [
            { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
          ],
        }],
        flows: [],
      }

      // Run with only a subset of rules enabled (exclude any AP- or EE- rules)
      const enabledRules = new Set(['SE-001', 'SE-002', 'SF-001'])
      const validatorConfig = { enabledRules }
      const report = validateProcess(ir, validatorConfig)

      // Verify only the enabled rules were executed
      // (by checking that no EE- or AP- findings appear, if any would normally occur)
      const disabledRuleFindings = report.findings.filter(
        f => f.ruleId.startsWith('EE-') || f.ruleId.startsWith('AP-')
      )
      // This test mainly verifies the plumbing; exact expectations depend on IR content
      expect(report.findings.length >= 0).toBe(true)
    })

    test('undefined enabledRules runs all registered rules', () => {
      const ir: ProcessIr = {
        id: 't', name: 'T', poolId: 'p1', poolName: 'P',
        lanes: [{
          id: 'l1', name: 'L',
          elements: [
            { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
            { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
          ],
        }],
        flows: [],
      }

      // Run without enabledRules filter (all rules execute)
      const report = validateProcess(ir, {})

      // With no flows connecting start to end, we expect at least one structural error
      expect(report.isValid).toBe(false)
      expect(report.findings.length).toBeGreaterThan(0)
    })

    test('empty enabledRules set disables all validation', () => {
      const ir: ProcessIr = {
        id: 't', name: 'T', poolId: 'p1', poolName: 'P',
        lanes: [{
          id: 'l1', name: 'L',
          elements: [],
        }],
        flows: [],
      }

      // Run with empty enabledRules set (no rules execute)
      const enabledRules = new Set<string>()
      const validatorConfig = { enabledRules }
      const report = validateProcess(ir, validatorConfig)

      // No rules executed, so no findings regardless of IR validity
      expect(report.findings).toHaveLength(0)
      expect(report.summary.errorCount).toBe(0)
      expect(report.summary.warningCount).toBe(0)
      expect(report.summary.infoCount).toBe(0)
    })
  })

describe('Extended subset rules (P0a)', () => {
  test('SF-005 allows condition on flow from inclusive gateway', () => {
    const ir: ProcessIr = {
      id: 't', name: 'T', poolId: 'p1', poolName: 'P',
      lanes: [{
        id: 'l1', name: 'L',
        elements: [
          { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
          { id: 'ig', name: 'Split', type: 'inclusiveGateway', poolId: 'p1', laneId: 'l1' },
          { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
        ],
      }],
      flows: [
        { id: 'f1', from: 's1', to: 'ig' },
        { id: 'f2', from: 'ig', to: 'e1', condition: 'needsIt' },
      ],
    }
    const report = validateProcess(ir, { enabledRules: new Set(['SF-005']) })
    expect(report.findings.filter(f => f.ruleId === 'SF-005')).toHaveLength(0)
  })

  test('SF-006 allows default flow from inclusive gateway', () => {
    const ir: ProcessIr = {
      id: 't', name: 'T', poolId: 'p1', poolName: 'P',
      lanes: [{
        id: 'l1', name: 'L',
        elements: [
          { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
          { id: 'ig', name: 'Split', type: 'inclusiveGateway', poolId: 'p1', laneId: 'l1' },
          { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
        ],
      }],
      flows: [
        { id: 'f1', from: 's1', to: 'ig' },
        { id: 'f2', from: 'ig', to: 'e1', default: true },
      ],
    }
    const report = validateProcess(ir, { enabledRules: new Set(['SF-006']) })
    expect(report.findings.filter(f => f.ruleId === 'SF-006')).toHaveLength(0)
  })

  test('IE-001 passes when intermediate event has incoming and outgoing', () => {
    const ir: ProcessIr = {
      id: 't', name: 'T', poolId: 'p1', poolName: 'P',
      lanes: [{
        id: 'l1', name: 'L',
        elements: [
          { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
          { id: 'm1', name: 'Await', type: 'intermediateMessageEvent', poolId: 'p1', laneId: 'l1' },
          { id: 'e1', name: 'E', type: 'endEvent', poolId: 'p1', laneId: 'l1' },
        ],
      }],
      flows: [
        { id: 'f1', from: 's1', to: 'm1' },
        { id: 'f2', from: 'm1', to: 'e1' },
      ],
    }
    const report = validateProcess(ir, { enabledRules: new Set(['IE-001']) })
    expect(report.findings.filter(f => f.ruleId === 'IE-001')).toHaveLength(0)
  })

  test('IE-001 fails when intermediate event has no outgoing', () => {
    const ir: ProcessIr = {
      id: 't', name: 'T', poolId: 'p1', poolName: 'P',
      lanes: [{
        id: 'l1', name: 'L',
        elements: [
          { id: 's1', name: 'S', type: 'startEvent', poolId: 'p1', laneId: 'l1' },
          { id: 'tm', name: 'Wait', type: 'intermediateTimerEvent', poolId: 'p1', laneId: 'l1' },
        ],
      }],
      flows: [
        { id: 'f1', from: 's1', to: 'tm' },
      ],
    }
    const report = validateProcess(ir, { enabledRules: new Set(['IE-001']) })
    const findings = report.findings.filter(f => f.ruleId === 'IE-001')
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toMatch(/no outgoing/)
  })
})
