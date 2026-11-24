export const BOT_PACKAGE_CONNECTORS = ['github', 'slack', 'linear', 'google', 'composio'] as const
export type BotPackageConnector = (typeof BOT_PACKAGE_CONNECTORS)[number]
