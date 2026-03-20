export type TabName = 'home' | 'collection' | 'garden'

export interface NavigationState {
  activeTab: TabName
  cardReturnTarget: TabName
}

const TAB_ROUTES: Record<string, TabName> = {
  '/': 'home',
  '/collection': 'collection',
  '/garden': 'garden',
}

const TAB_PATHS: Record<TabName, string> = {
  home: '/',
  collection: '/collection',
  garden: '/garden',
}

export function createInitialNavigationState(): NavigationState {
  return {
    activeTab: 'home',
    cardReturnTarget: 'home',
  }
}

export function getActiveTab(pathname: string): TabName | null {
  if (TAB_ROUTES[pathname]) return TAB_ROUTES[pathname]
  for (const [route, tab] of Object.entries(TAB_ROUTES)) {
    if (route !== '/' && pathname.startsWith(route)) return tab
  }
  return null
}

export function setCardReturnTarget(
  state: NavigationState,
  origin: TabName
): NavigationState {
  return { ...state, cardReturnTarget: origin }
}

export function getCardReturnTarget(state: NavigationState): string {
  return TAB_PATHS[state.cardReturnTarget]
}
