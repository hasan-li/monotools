import React, { useEffect, useMemo, useState } from 'react';
import JSONBigFactory from 'json-bigint';

const JSONBig = JSONBigFactory();

type JsonBigNumber = { toString: () => string; constructor?: { name?: string } };
export type JsonValue = string | number | boolean | bigint | JsonBigNumber | null | JsonObject | JsonArray;
export interface JsonObject {
  [key: string]: JsonValue;
}
export type JsonArray = Array<JsonValue>;

interface JsonTreeViewProps {
  data: string | JsonValue;
  darkMode: boolean;
  showLineNumbers: boolean;
}

interface TreeNodeModel {
  id: string;
  path: string;
  level: number;
  nodeKey: string | null;
  kind: 'null' | 'primitive' | 'empty' | 'container';
  primitiveKind?: 'string' | 'number' | 'boolean';
  value?: string;
  isArray?: boolean;
  startLine: number;
  endLine: number;
  children: TreeNodeModel[];
}

interface VisibleRow {
  id: string;
  level: number;
  lineNumber: number;
  type: 'null' | 'primitive' | 'empty' | 'container-start' | 'container-end';
  nodeKey: string | null;
  primitiveKind?: 'string' | 'number' | 'boolean';
  value?: string;
  isArray?: boolean;
  path?: string;
  expanded?: boolean;
}

interface TreeRowProps {
  indent: number;
  darkMode: boolean;
  showLineNumbers: boolean;
  lineNumber: number;
  lineNumberWidthCh: number;
  children: React.ReactNode;
}

const isContainer = (value: JsonValue): value is JsonObject | JsonArray => value !== null && typeof value === 'object';
const isBigNumberLike = (value: unknown): value is JsonBigNumber =>
  typeof value === 'object'
  && value !== null
  && (value as { constructor?: { name?: string } }).constructor?.name === 'BigNumber';
const isTreeContainer = (value: JsonValue): value is JsonObject | JsonArray =>
  isContainer(value) && !isBigNumberLike(value);
const encodePathSegment = (segment: string): string => segment.replace(/~/g, '~0').replace(/\//g, '~1');
const appendPath = (path: string, segment: string): string => `${path}/${encodePathSegment(segment)}`;

const buildTreeModel = (
  value: JsonValue,
  level: number,
  nodeKey: string | null,
  path: string,
  startLine: number,
): { node: TreeNodeModel; nextLine: number } => {
  if (value === null) {
    return {
      node: {
        id: `${path}:null`,
        path,
        level,
        nodeKey,
        kind: 'null',
        value: 'null',
        startLine,
        endLine: startLine,
        children: [],
      },
      nextLine: startLine + 1,
    };
  }

  if (!isTreeContainer(value)) {
    if (typeof value === 'string') {
      return {
        node: {
          id: `${path}:primitive`,
          path,
          level,
          nodeKey,
          kind: 'primitive',
          primitiveKind: 'string',
          value: JSON.stringify(value),
          startLine,
          endLine: startLine,
          children: [],
        },
        nextLine: startLine + 1,
      };
    }

    if (typeof value === 'number' || typeof value === 'bigint' || isBigNumberLike(value)) {
      return {
        node: {
          id: `${path}:primitive`,
          path,
          level,
          nodeKey,
          kind: 'primitive',
          primitiveKind: 'number',
          value: String(value),
          startLine,
          endLine: startLine,
          children: [],
        },
        nextLine: startLine + 1,
      };
    }

    return {
      node: {
        id: `${path}:primitive`,
        path,
        level,
        nodeKey,
        kind: 'primitive',
        primitiveKind: 'boolean',
        value: String(value),
        startLine,
        endLine: startLine,
        children: [],
      },
      nextLine: startLine + 1,
    };
  }

  const isArray = Array.isArray(value);
  const keys = Object.keys(value);

  if (keys.length === 0) {
    return {
      node: {
        id: `${path}:empty`,
        path,
        level,
        nodeKey,
        kind: 'empty',
        value: isArray ? '[]' : '{}',
        isArray,
        startLine,
        endLine: startLine,
        children: [],
      },
      nextLine: startLine + 1,
    };
  }

  const children: TreeNodeModel[] = [];
  let nextLine = startLine + 1;

  keys.forEach((key) => {
    const child = buildTreeModel(
      (value as JsonObject)[key],
      level + 1,
      isArray ? null : key,
      appendPath(path, key),
      nextLine,
    );
    children.push(child.node);
    nextLine = child.nextLine;
  });

  return {
    node: {
      id: `${path}:container`,
      path,
      level,
      nodeKey,
      kind: 'container',
      isArray,
      startLine,
      endLine: nextLine,
      children,
    },
    nextLine: nextLine + 1,
  };
};

const collectDefaultExpandedPaths = (node: TreeNodeModel, expandedPaths: Set<string>): void => {
  if (node.kind !== 'container' || node.children.length === 0) {
    return;
  }

  if (node.level < 2) {
    expandedPaths.add(node.path);
  }

  if (node.level >= 1) {
    return;
  }

  node.children.forEach((child) => collectDefaultExpandedPaths(child, expandedPaths));
};

const buildVisibleRows = (node: TreeNodeModel, expandedPaths: Set<string>): VisibleRow[] => {
  const rows: VisibleRow[] = [];

  const visit = (current: TreeNodeModel): void => {
    if (current.kind === 'null') {
      rows.push({
        id: `${current.id}:row`,
        level: current.level,
        lineNumber: current.startLine,
        type: 'null',
        nodeKey: current.nodeKey,
        value: current.value,
      });
      return;
    }

    if (current.kind === 'primitive') {
      rows.push({
        id: `${current.id}:row`,
        level: current.level,
        lineNumber: current.startLine,
        type: 'primitive',
        nodeKey: current.nodeKey,
        primitiveKind: current.primitiveKind,
        value: current.value,
      });
      return;
    }

    if (current.kind === 'empty') {
      rows.push({
        id: `${current.id}:row`,
        level: current.level,
        lineNumber: current.startLine,
        type: 'empty',
        nodeKey: current.nodeKey,
        value: current.value,
        isArray: current.isArray,
      });
      return;
    }

    const expanded = expandedPaths.has(current.path);

    rows.push({
      id: `${current.id}:start`,
      level: current.level,
      lineNumber: current.startLine,
      type: 'container-start',
      nodeKey: current.nodeKey,
      isArray: current.isArray,
      path: current.path,
      expanded,
    });

    if (!expanded) {
      return;
    }

    current.children.forEach((child) => visit(child));

    rows.push({
      id: `${current.id}:end`,
      level: current.level,
      lineNumber: current.endLine,
      type: 'container-end',
      nodeKey: null,
      isArray: current.isArray,
    });
  };

  visit(node);
  return rows;
};

const TreeRow: React.FC<TreeRowProps> = ({
  indent,
  darkMode,
  showLineNumbers,
  lineNumber,
  lineNumberWidthCh,
  children,
}) => {
  return (
    <div className={`flex items-start ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
      {showLineNumbers && (
        <span
          className="shrink-0 pr-2 text-right select-none text-muted-foreground [font-variant-numeric:tabular-nums]"
          style={{ width: `${lineNumberWidthCh}ch` }}
        >
          {lineNumber}
        </span>
      )}
      <div className="flex min-w-0 flex-1 items-start" style={{ paddingLeft: `${indent}px` }}>
        {children}
      </div>
    </div>
  );
};

export const JsonTreeView: React.FC<JsonTreeViewProps> = ({ data, darkMode, showLineNumbers }) => {
  const parseResult = useMemo(() => {
    if (typeof data === 'string') {
      if (!data.trim()) {
        return { value: null as JsonValue | null, error: '', isEmpty: true };
      }

      try {
        return { value: JSONBig.parse(data) as JsonValue, error: '', isEmpty: false };
      } catch (err) {
        return {
          value: null as JsonValue | null,
          error: err instanceof Error ? err.message : 'Unknown error',
          isEmpty: false,
        };
      }
    }

    if (data === null) {
      return { value: null as JsonValue | null, error: '', isEmpty: true };
    }

    return { value: data, error: '', isEmpty: false };
  }, [data]);

  const hasRenderableData = !parseResult.error && !parseResult.isEmpty;

  const rootNode = useMemo(
    () => (hasRenderableData ? buildTreeModel(parseResult.value as JsonValue, 0, null, '$', 1).node : null),
    [hasRenderableData, parseResult.value],
  );

  const defaultExpandedPaths = useMemo(() => {
    const expandedPaths = new Set<string>();
    if (rootNode) {
      collectDefaultExpandedPaths(rootNode, expandedPaths);
    }
    return expandedPaths;
  }, [rootNode]);

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(defaultExpandedPaths);

  useEffect(() => {
    setExpandedPaths(defaultExpandedPaths);
  }, [defaultExpandedPaths]);

  const rows = useMemo(() => (rootNode ? buildVisibleRows(rootNode, expandedPaths) : []), [rootNode, expandedPaths]);
  const lineNumberWidthCh = useMemo(() => {
    if (!showLineNumbers || rows.length === 0) {
      return 0;
    }

    const maxLine = rows[rows.length - 1]?.lineNumber ?? 1;
    return String(maxLine).length + 1;
  }, [rows, showLineNumbers]);

  const keyColor = darkMode ? 'text-blue-300' : 'text-blue-600';
  const nullColor = darkMode ? 'text-gray-400' : 'text-gray-500';
  const stringColor = darkMode ? 'text-green-300' : 'text-green-600';
  const numberColor = darkMode ? 'text-yellow-300' : 'text-yellow-600';
  const booleanColor = darkMode ? 'text-purple-300' : 'text-purple-600';

  const togglePath = (path: string): void => {
    setExpandedPaths((previous) => {
      const next = new Set(previous);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  if (parseResult.error) {
    return <div className="text-destructive font-mono">
      Invalid JSON: {parseResult.error}
    </div>;
  }

  if (parseResult.isEmpty) {
    return null;
  }

  return (
    <div>
      {rows.map((row) => (
        <TreeRow
          key={row.id}
          indent={row.level * 20}
          darkMode={darkMode}
          showLineNumbers={showLineNumbers}
          lineNumber={row.lineNumber}
          lineNumberWidthCh={lineNumberWidthCh}
        >
          {row.type === 'container-start' ? (
            <button
              type="button"
              className="flex min-w-0 items-center gap-2 text-left cursor-pointer"
              onClick={() => row.path && togglePath(row.path)}
            >
              <span className="shrink-0">{row.expanded ? '▼' : '►'}</span>
              {row.nodeKey !== null && <span className={`shrink-0 ${keyColor}`}>{JSON.stringify(row.nodeKey)}:</span>}
              <span>{row.isArray ? '[' : '{'}</span>
              {!row.expanded && <span>...</span>}
              {!row.expanded && <span>{row.isArray ? ']' : '}'}</span>}
            </button>
          ) : row.type === 'container-end' ? (
            <span>{row.isArray ? ']' : '}'}</span>
          ) : row.type === 'empty' ? (
            <>
              {row.nodeKey !== null && <span className={`mr-2 shrink-0 ${keyColor}`}>{JSON.stringify(row.nodeKey)}:</span>}
              <span>{row.value}</span>
            </>
          ) : row.type === 'null' ? (
            <>
              {row.nodeKey !== null && <span className={`mr-2 shrink-0 ${keyColor}`}>{JSON.stringify(row.nodeKey)}:</span>}
              <span className={nullColor}>null</span>
            </>
          ) : (
            <>
              {row.nodeKey !== null && <span className={`mr-2 shrink-0 ${keyColor}`}>{JSON.stringify(row.nodeKey)}:</span>}
              <span
                className={
                  row.primitiveKind === 'number'
                    ? `${numberColor} break-all`
                    : row.primitiveKind === 'boolean'
                      ? `${booleanColor} break-all`
                      : `${stringColor} break-all`
                }
              >
                {row.value}
              </span>
            </>
          )}
        </TreeRow>
      ))}
    </div>
  );
};
