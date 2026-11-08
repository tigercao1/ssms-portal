import { Fragment, type ReactNode } from 'react';

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'list'; items: string[] };

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const BOLD = /\*\*(.+?)\*\*|__(.+?)__/;
const EMPHASIS_MARKER = /\*\*|__/g;

function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] | null = null;
  const lastList = () => {
    const last = blocks[blocks.length - 1];
    return last?.kind === 'list' ? last : null;
  };
  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const bullet = BULLET.exec(line);
    const heading = HEADING.exec(line);
    if (!line.trim()) {
      paragraph = null;
    } else if (heading) {
      paragraph = null;
      blocks.push({
        kind: 'heading',
        level: heading[1]!.length,
        text: heading[2]!,
      });
    } else if (bullet) {
      paragraph = null;
      const item = bullet[1]!;
      const list = lastList();
      if (list) list.items.push(item);
      else blocks.push({ kind: 'list', items: [item] });
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
  const plain = (value: string) => value.replace(EMPHASIS_MARKER, '');
  while (rest) {
    const match = BOLD.exec(rest);
    if (!match) {
      nodes.push(plain(rest));
      break;
    }
    if (match.index > 0) nodes.push(plain(rest.slice(0, match.index)));
    const [whole, stars, underscores] = match;
    nodes.push(
      <strong key={nodes.length}>{plain(stars ?? underscores!)}</strong>,
    );
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
          case 'list':
            return (
              <ul key={index} className="flex flex-col gap-1 pl-6 list-disc">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{renderInline(item)}</li>
                ))}
              </ul>
            );
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
