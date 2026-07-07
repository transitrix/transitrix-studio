import * as vscode from 'vscode';
import {
  parseNodeSizePreset,
  resolveActionNodeSize,
  resolveBlocksLeafSize,
  resolveCapabilityMapNodeSize,
  resolveDgcaNodeSize,
  resolveGoalsNodeSize,
  resolveProcessBlueprintSize,
  type NodeSizeNotation,
  type NodeSizePreset,
} from '@transitrix/diagrams/node-size-presets.js';
import type { ControlMessage } from './preview-controls.js';

export type { NodeSizeNotation, NodeSizePreset };

/** Config section that, when changed, re-renders node-size-aware previews. */
export const NODE_SIZE_CONFIG_SECTION = 'transitrix.nodeSize';

/** Command that opens Settings filtered to the node size controls. */
export const OPEN_NODE_SIZE_SETTINGS_COMMAND = 'transitrixStudio.openNodeSizeSettings';

/** Reads the configured block/cell size preset for a notation (default `normal`). */
export function readNodeSizePreset(notation: NodeSizeNotation): NodeSizePreset {
  const raw = vscode.workspace.getConfiguration('transitrix').get<string>(`nodeSize.${notation}`, 'normal');
  return parseNodeSizePreset(raw);
}

export function readGoalsNodeSize() {
  return resolveGoalsNodeSize(readNodeSizePreset('goals'));
}

export function readDgcaNodeSize(notation: 'dgca' | 'dga') {
  return resolveDgcaNodeSize(readNodeSizePreset(notation));
}

export function readBlocksLeafSize() {
  return resolveBlocksLeafSize(readNodeSizePreset('blocks'));
}

export function readActionNodeSize() {
  return resolveActionNodeSize(readNodeSizePreset('action'));
}

export function readProcessBlueprintSize() {
  return resolveProcessBlueprintSize(readNodeSizePreset('processBlueprint'));
}

export function readCapabilityMapNodeSize() {
  return resolveCapabilityMapNodeSize(readNodeSizePreset('capabilityMap'));
}

/** Maps interactive preview notation keys to `transitrix.nodeSize.*` settings keys. */
export function nodeSizeSettingKey(
  notation: 'goals' | 'dgca' | 'dga' | 'action' | 'blocks' | 'processBlueprint',
): NodeSizeNotation {
  return notation;
}

export async function applyNodeSizeControlMessage(
  notation: 'goals' | 'dgca' | 'dga' | 'action' | 'blocks' | 'processBlueprint',
  msg: ControlMessage,
): Promise<void> {
  if (!msg || msg.type !== 'transitrix:control' || msg.control !== 'nodeSize') return;
  const preset = parseNodeSizePreset(String(msg.value ?? 'normal'));
  const cfg = vscode.workspace.getConfiguration('transitrix');
  await cfg.update(`nodeSize.${nodeSizeSettingKey(notation)}`, preset, vscode.ConfigurationTarget.Global);
}
