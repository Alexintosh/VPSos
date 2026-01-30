import { useState } from 'react';
import { MenuSection, useUI } from './state';

const baseMenus = (hasWindow: boolean, tile: (layout: any) => void, gridRows: number, setGrid: (rows: number, cols: number) => void) => {
  const gridOptions = [
    { label: '4-cell (2x2)', rows: 2, cols: 2 },
    { label: '6-cell (3x2)', rows: 3, cols: 2 },
    { label: '8-cell (4x2)', rows: 4, cols: 2 }
  ];
  return [
    {
      title: 'DevOS',
      items: [{ label: 'About DevOS' }]
    },
    {
      title: 'Window',
      items: [
        { label: 'Tile Left Half', action: () => hasWindow && tile('left'), disabled: !hasWindow },
        { label: 'Tile Right Half', action: () => hasWindow && tile('right'), disabled: !hasWindow },
        { label: 'Tile Top Half', action: () => hasWindow && tile('top'), disabled: !hasWindow },
        { label: 'Tile Bottom Half', action: () => hasWindow && tile('bottom'), disabled: !hasWindow },
        { label: 'Tile Top Left', action: () => hasWindow && tile('tl'), disabled: !hasWindow },
        { label: 'Tile Top Right', action: () => hasWindow && tile('tr'), disabled: !hasWindow },
        { label: 'Tile Bottom Left', action: () => hasWindow && tile('bl'), disabled: !hasWindow },
        { label: 'Tile Bottom Right', action: () => hasWindow && tile('br'), disabled: !hasWindow },
        { label: 'Tile Center', action: () => hasWindow && tile('center'), disabled: !hasWindow }
      ]
    },
    {
      title: 'Layout',
      items: gridOptions.map((opt) => ({
        label: `${opt.label}${gridRows === opt.rows ? ' ✓' : ''}`,
        action: () => setGrid(opt.rows, opt.cols)
      }))
    }
  ] satisfies MenuSection[];
};

export const MenuBar = () => {
  const { windows, focusedId, tile, gridRows, setGrid } = useUI();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const focused = windows.find((w) => w.id === focusedId);
  const sections: MenuSection[] = [
    ...baseMenus(!!focused, (layout: string) => {
      if (focused) tile(focused.id, layout as any);
    }, gridRows, setGrid)
  ];
  if (focused?.menus?.length) sections.push(...focused.menus);

  const toggle = (title: string) => {
    setOpenMenu((prev) => (prev === title ? null : title));
  };

  return (
    <div className="menubar">
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
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
