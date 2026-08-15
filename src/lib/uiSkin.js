export const CURSOR_ROLES = ['normal','interactive','exit'];

export function cursorRoleForObject(object = {}) {
  return object?.type === 'exit' ? 'exit' : 'interactive';
}

export function normalizeCursorRoles(value = {}) {
  return { normal: value.normal || '', interactive: value.interactive || '', exit: value.exit || '' };
}

export function backgroundSizeForFit(fit = 'stretch') {
  if (fit === 'cover' || fit === 'contain') return fit;
  return '100% 100%';
}
