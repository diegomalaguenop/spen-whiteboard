export interface NotionConfig {
  token: string
  parentPageId: string
  databaseId: string
  dataSourceId: string
}

export interface NotionBoardLink {
  notionPageId: string
  codeBlockId: string
  imageBlockId: string
  remoteUpdatedAt: number
}
