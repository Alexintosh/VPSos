import { useState } from 'react';
import { MenuSection, useUI } from './state';

const baseMenus = (hasWindow: boolean, tile: (layout: any) => void) => {
  return [
    {
      title: 'DevOS',
      items: [{ label: 'About DevOS' }]
    },
    {
      title: 'Window',
      items: [
        { label: 'Tile Left', action: () => hasWindow && tile('left'), disabled: !hasWindow },
        { label: 'Tile Right', action: () => hasWindow && tile('right'), disabled: !hasWindow },
        { label: 'Tile Top', action: () => hasWindow && tile('top'), disabled: !hasWindow },
        { label: 'Tile Bottom', action: () => hasWindow && tile('bottom'), disabled: !hasWindow },
        { label: 'Tile Center', action: () => hasWindow && tile('center'), disabled: !hasWindow }
      ]
    }
  ] satisfies MenuSection[];
};

export const MenuBar = () => {
  const { windows, focusedId, tile } = useUI();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const focused = windows.find((w) => w.id === focusedId);
  const sections: MenuSection[] = [
    ...baseMenus(!!focused, (layout: string) => {
      if (focused) tile(focused.id, layout as any);
    })
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
