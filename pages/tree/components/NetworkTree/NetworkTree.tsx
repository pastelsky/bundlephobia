type TreeNode = {
  name: string
  version: string | null
  packageString?: string
}

type TreeLink = {
  source: string
  target: string
}

type NetworkTreeProps = {
  nodes: TreeNode[]
  links: TreeLink[]
}

export default function NetworkTree(props: NetworkTreeProps) {
  void props

  return null
}
