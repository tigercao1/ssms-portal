import { Fragment, type ReactNode } from 'react';

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'rule' };

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const INLINE = /\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_|\[([^\]]+)\]\(([^)\s]+)\)/;
const SAFE_LINK = /^(https:|mailto:)/i;

function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] | null = null;
  const lastList = (ordered: boolean) => {
    const last = blocks[blocks.length - 1];
    return last?.kind === 'list' && last.ordered === ordered ? last : null;
  };
  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const heading = HEADING.exec(line);
    if (!line.trim()) {
      paragraph = null;
    } else if (RULE.test(line)) {
      paragraph = null;
      blocks.push({ kind: 'rule' });
    } else if (heading) {
      paragraph = null;
      blocks.push({
        kind: 'heading',
        level: heading[1]!.length,
        text: heading[2]!,
      });
    } else if (bullet || numbered) {
      paragraph = null;
      const ordered = Boolean(numbered);
      const item = (bullet ?? numbered)![1]!;
      const list = lastList(ordered);
      if (list) list.items.push(item);
      else blocks.push({ kind: 'list', ordered, items: [item] });
    } else if (paragraph) {
      paragraph.push(line.trim());
    } else {
      paragraph = [line.trim()];
      blocks.push({ kind: 'paragraph', lines: paragraph });
    }
  }
  return blocks;
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let rest = text;
  while (rest) {
    const match = INLINE.exec(rest);
    if (!match) {
      nodes.push(rest);
      break;
    }
    if (match.index > 0) nodes.push(rest.slice(0, match.index));
    const [whole, bold, italic, underscored, linkText, href] = match;
    const key = nodes.length;
    if (bold !== undefined)
      nodes.push(<strong key={key}>{renderInline(bold)}</strong>);
    else if (italic !== undefined || underscored !== undefined)
      nodes.push(<em key={key}>{renderInline(italic ?? underscored!)}</em>);
    else if (href && SAFE_LINK.test(href))
      nodes.push(
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-navy underline"
        >
          {linkText}
        </a>,
      );
    else nodes.push(linkText ?? whole);
    rest = rest.slice(match.index + whole.length);
  }
  return nodes;
}

const HEADING_CLASSES = [
  'text-lg font-semibold',
  'text-base font-semibold',
  'text-base font-medium',
];

export function Markdown({ source }: { source: string }) {
  return (
    <div className="flex flex-col gap-3 text-base leading-relaxed text-ink">
      {parseBlocks(source).map((block, index) => {
        switch (block.kind) {
          case 'heading': {
            const Tag =
              block.level <= 1 ? 'h2' : block.level === 2 ? 'h3' : 'h4';
            return (
              <Tag
                key={index}
                className={HEADING_CLASSES[Math.min(block.level, 3) - 1]}
              >
                {renderInline(block.text)}
              </Tag>
            );
          }
          case 'list': {
            const Tag = block.ordered ? 'ol' : 'ul';
            return (
              <Tag
                key={index}
                className={`flex flex-col gap-1 pl-6 ${block.ordered ? 'list-decimal' : 'list-disc'}`}
              >
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{renderInline(item)}</li>
                ))}
              </Tag>
            );
          }
          case 'rule':
            return <hr key={index} className="border-grey" />;
          default:
            return (
              <p key={index}>
                {block.lines.map((line, lineIndex) => (
                  <Fragment key={lineIndex}>
                    {lineIndex > 0 && <br />}
                    {renderInline(line)}
                  </Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
