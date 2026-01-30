import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { MenuSection, useUI } from './state';

type IconStyle = CSSProperties & {
  ['--tile-left']?: string;
  ['--tile-top']?: string;
  ['--tile-width']?: string;
  ['--tile-height']?: string;
};

const TileIcon = ({ left, top, width, height }: { left: number; top: number; width: number; height: number }) => (
  <span
    className="menu-icon"
    style={{
      '--tile-left': `${left}%`,
      '--tile-top': `${top}%`,
      '--tile-width': `${width}%`,
      '--tile-height': `${height}%`
    } as IconStyle}
  />
);

const GridIcon = ({ rows, cols }: { rows: number; cols: number }) => {
  const style: CSSProperties = {
    backgroundImage: `linear-gradient(90deg, rgba(255,255,255,0.25) 0, rgba(255,255,255,0.25) 1px, transparent 1px),
      linear-gradient(180deg, rgba(255,255,255,0.25) 0, rgba(255,255,255,0.25) 1px, transparent 1px)`,
    backgroundSize: `${100 / cols}% 100%, 100% ${100 / rows}%`,
    backgroundRepeat: 'repeat'
  };
  return <span className="menu-icon grid" style={style} />;
};

const buildMenus = (
  hasWindow: boolean,
  tile: (layout: any) => void,
  gridRows: number,
  setGrid: (rows: number, cols: number) => void,
  toggleMax: (id: string) => void,
  focusedId?: string | null
) => {
  const windowItems = [
    { label: 'Center', action: () => hasWindow && tile('center'), icon: <TileIcon left={15} top={15} width={70} height={70} /> },
    { label: 'Fullscreen', action: () => hasWindow && focusedId && toggleMax(focusedId), icon: <TileIcon left={0} top={0} width={100} height={100} /> },
    { label: 'Half Left', action: () => hasWindow && tile('left'), icon: <TileIcon left={0} top={0} width={50} height={100} /> },
    { label: 'Half Right', action: () => hasWindow && tile('right'), icon: <TileIcon left={50} top={0} width={50} height={100} /> },
    { label: 'Half Top', action: () => hasWindow && tile('top'), icon: <TileIcon left={0} top={0} width={100} height={50} /> },
    { label: 'Half Bottom', action: () => hasWindow && tile('bottom'), icon: <TileIcon left={0} top={50} width={100} height={50} /> },
    { label: 'Upper Left', action: () => hasWindow && tile('tl'), icon: <TileIcon left={0} top={0} width={50} height={50} /> },
    { label: 'Upper Right', action: () => hasWindow && tile('tr'), icon: <TileIcon left={50} top={0} width={50} height={50} /> },
    { label: 'Lower Left', action: () => hasWindow && tile('bl'), icon: <TileIcon left={0} top={50} width={50} height={50} /> },
    { label: 'Lower Right', action: () => hasWindow && tile('br'), icon: <TileIcon left={50} top={50} width={50} height={50} /> }
  ].map((item) => ({ ...item, disabled: !hasWindow }));

  const gridOptions = [
    { label: '4-cell (2×2)', rows: 2, cols: 2 },
    { label: '6-cell (3×2)', rows: 3, cols: 2 },
    { label: '8-cell (4×2)', rows: 4, cols: 2 }
  ];

  return [
    {
      title: 'DevOS',
      items: [{ label: 'About DevOS' }]
    },
    {
      title: 'Window',
      items: windowItems
    },
    {
      title: 'Layout',
      items: gridOptions.map((opt) => ({
        label: `${opt.label}${gridRows === opt.rows ? ' ✓' : ''}`,
        action: () => setGrid(opt.rows, opt.cols),
        icon: <GridIcon rows={opt.rows} cols={opt.cols} />
      }))
    }
  ] satisfies MenuSection[];
};

export const MenuBar = () => {
  const { windows, focusedId, tile, gridRows, setGrid, toggleMax } = useUI();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menubarRef = useRef<HTMLDivElement | null>(null);
  const focused = windows.find((w) => w.id === focusedId);
  useEffect(() => {
    if (!openMenu) return;
    const handler = (ev: MouseEvent) => {
      if (!menubarRef.current) return;
      if (menubarRef.current.contains(ev.target as Node)) return;
      setOpenMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenu]);
  const baseSections: MenuSection[] = useMemo(() => buildMenus(
    !!focused,
    (layout: string) => focused && tile(focused.id, layout as any),
    gridRows,
    setGrid,
    (id) => toggleMax(id),
    focused?.id
  ), [focused, gridRows, setGrid, tile, toggleMax]);
  const sections = focused?.menus?.length ? [...baseSections, ...focused.menus] : baseSections;

  const toggle = (title: string) => {
    setOpenMenu((prev) => (prev === title ? null : title));
  };

  return (
    <div className="menubar" ref={menubarRef}>
      {sections.map((section) => (
        <div key={section.title} className={`menu ${openMenu === section.title ? 'open' : ''}`}>
          <button onClick={() => toggle(section.title)}>{section.title}</button>
          {openMenu === section.title && (
            <div className="menu-dropdown">
              {section.items.map((item) => (
                <button
                  key={item.label}
                  disabled={item.disabled}
                  onClick={() => {
                    item.action?.();
                    setOpenMenu(null);
                  }}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
