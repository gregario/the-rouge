export type TabName = 'home' | 'collection' | 'garden'

const TAB_ROUTES: Record<string, TabName> = {
  '/': 'home',
  '/collection': 'collection',
  '/garden': 'garden',
}

export function getActiveTab(pathname: string): TabName | null {
  if (TAB_ROUTES[pathname]) return TAB_ROUTES[pathname]
  for (const [route, tab] of Object.entries(TAB_ROUTES)) {
    if (route !== '/' && pathname.startsWith(route)) return tab
  }
  return null
}

