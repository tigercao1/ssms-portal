export function translateText(root: Node, translated: string): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode())
    if (walker.currentNode instanceof Text) textNodes.push(walker.currentNode);
  for (const node of textNodes) {
    const outer = document.createElement('font');
    const inner = document.createElement('font');
    inner.textContent = translated;
    outer.append(inner);
    node.replaceWith(outer);
  }
}
