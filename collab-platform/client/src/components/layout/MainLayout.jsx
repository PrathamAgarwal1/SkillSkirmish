import React from 'react';
import LeftSidebar from './LeftSidebar';

const MainLayout = ({ children }) => {
    return (
        <div className="layout-wrapper">
            <LeftSidebar />
            <main className="center-panel">
                {children}
            </main>
        </div>
    );
};

export default MainLayout;
