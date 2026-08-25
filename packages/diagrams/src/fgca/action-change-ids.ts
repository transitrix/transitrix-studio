/**
 * Action → Change linkage on an element record.
 *
 * Canonical field is `delivers_changes` (Action element spec). `changes` is
 * the pre-rename alias still present on older fixtures and inline docs.
 */
export function actionChangeLinkField(
  el: Record<string, unknown>,
): 'delivers_changes' | 'changes' {
  return Object.prototype.hasOwnProperty.call(el, 'delivers_changes')
    ? 'delivers_changes'
    : 'changes';
}
