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

export function bottomGuiBand(screen = {}, viewport = {}) {
  const height=Math.max(0,Number(screen.height||0));
  const width=Math.max(0,Number(screen.width||0));
  const top=Math.max(0,Math.min(height,Number(viewport.y||0)+Number(viewport.height||0)));
  return {left:0,top,width,height:Math.max(0,height-top)};
}

export function skinMakesElementTransparent(element = {}) {
  return !!element.asset && ['verbButton','button','panel'].includes(element.type);
}
