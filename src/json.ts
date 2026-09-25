import JSONBigFactory from 'json-bigint';

const JSONBig = JSONBigFactory();

export const MAX_JSON_INPUT_SIZE = 5 * 1024 * 1024;
export const isJsonInputTooLarge = (input: string): boolean =>
  new TextEncoder().encode(input).byteLength > MAX_JSON_INPUT_SIZE;

export const parseJson = (input: string): unknown => JSONBig.parse(input) as unknown;
export const stringifyJson = (value: unknown, indent?: number): string => JSONBig.stringify(value, null, indent);

export interface JsonRenderRow {
  lineNumber: number;
  prefix: string;
  content: string;
  collapsiblePath?: string;
}

const isBigNumberLike = (value: unknown): boolean =>
  typeof value === 'object'
  && value !== null
  && (value as { constructor?: { name?: string } }).constructor?.name === 'BigNumber';

const isRenderableContainer = (value: unknown): value is Record<string, unknown> | unknown[] =>
  typeof value === 'object' && value !== null && !isBigNumberLike(value);

export const sortJsonKeys = (value: unknown): unknown => {
  if (!isRenderableContainer(value)) return value;
  if (Array.isArray(value)) return value.map(sortJsonKeys);

  const entries = Object.entries(value)
    .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey));

  return entries.reduce<Record<string, unknown>>((accumulator, [key, entryValue]) => {
    accumulator[key] = sortJsonKeys(entryValue);
    return accumulator;
  }, {});
};

const toJsonPrimitiveString = (value: unknown): string => {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (isBigNumberLike(value)) return String(value);
  return JSON.stringify(value);
};

const encodePathSegment = (segment: string): string => segment.replace(/~/g, '~0').replace(/\//g, '~1');

export const getInitialExpandedPaths = (value: unknown): Set<string> =>
  isRenderableContainer(value) && Object.keys(value).length > 0 ? new Set(['$']) : new Set();

export const buildTreeRows = (rootValue: unknown, expandedPaths: Set<string>): JsonRenderRow[] => {
  const rows: JsonRenderRow[] = [];
  let lineNumber = 1;

  const pushRow = (prefix: string, content: string, collapsiblePath?: string): void => {
    rows.push({ lineNumber: lineNumber++, prefix, content, collapsiblePath });
  };

  const renderNode = (
    value: unknown,
    key: string | null,
    ancestorsHaveSibling: boolean[],
    isLast: boolean,
    path: string,
  ): void => {
    const branchPrefix = ancestorsHaveSibling.map((hasSibling) => (hasSibling ? '|   ' : '    ')).join('');
    const prefix = `${branchPrefix}${isLast ? '`-- ' : '|-- '}`;
    const keyPrefix = key === null ? '' : `${JSON.stringify(key)}: `;

    if (!isRenderableContainer(value)) {
      pushRow(prefix, `${keyPrefix}${toJsonPrimitiveString(value)}${isLast ? '' : ','}`);
      return;
    }

    const isArray = Array.isArray(value);
    const openToken = isArray ? '[' : '{';
    const closeToken = isArray ? ']' : '}';
    const entries = isArray
      ? value.map((item, index) => ({ segment: String(index), childKey: null as string | null, childValue: item }))
      : Object.entries(value).map(([entryKey, entryValue]) => ({
        segment: entryKey,
        childKey: entryKey,
        childValue: entryValue,
      }));

    if (entries.length === 0) {
      pushRow(prefix, `${keyPrefix}${openToken}${closeToken}${isLast ? '' : ','}`);
      return;
    }

    if (!expandedPaths.has(path)) {
      pushRow(prefix, `${keyPrefix}${openToken} ... ${closeToken}${isLast ? '' : ','}`, path);
      return;
    }

    pushRow(prefix, `${keyPrefix}${openToken}`, path);
    const nextAncestors = [...ancestorsHaveSibling, !isLast];

    entries.forEach((entry, index) => {
      renderNode(
        entry.childValue,
        entry.childKey,
        nextAncestors,
        index === entries.length - 1,
        `${path}/${encodePathSegment(entry.segment)}`,
      );
    });

    const closingPrefix = `${branchPrefix}${isLast ? '    ' : '|   '}`;
    pushRow(closingPrefix, `${closeToken}${isLast ? '' : ','}`);
  };

  if (!isRenderableContainer(rootValue)) {
    pushRow('', toJsonPrimitiveString(rootValue));
    return rows;
  }

  const rootPath = '$';
  const rootIsArray = Array.isArray(rootValue);
  const rootOpenToken = rootIsArray ? '[' : '{';
  const rootCloseToken = rootIsArray ? ']' : '}';
  const rootEntries = rootIsArray
    ? rootValue.map((item, index) => ({ segment: String(index), childKey: null as string | null, childValue: item }))
    : Object.entries(rootValue).map(([entryKey, entryValue]) => ({
      segment: entryKey,
      childKey: entryKey,
      childValue: entryValue,
    }));

  if (rootEntries.length === 0) {
    pushRow('', `${rootOpenToken}${rootCloseToken}`);
    return rows;
  }

  if (!expandedPaths.has(rootPath)) {
    pushRow('', `${rootOpenToken} ... ${rootCloseToken}`, rootPath);
    return rows;
  }

  pushRow('', rootOpenToken, rootPath);
  rootEntries.forEach((entry, index) => {
    renderNode(
      entry.childValue,
      entry.childKey,
      [],
      index === rootEntries.length - 1,
      `${rootPath}/${encodePathSegment(entry.segment)}`,
    );
  });
  pushRow('', rootCloseToken);
  return rows;
};
