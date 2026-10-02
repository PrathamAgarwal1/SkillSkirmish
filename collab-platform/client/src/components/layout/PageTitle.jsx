import React from 'react';

/** Page heading with the site's terminal flavour: a ~/path prompt above the title and a blinking cursor. */
const PageTitle = ({ path, title, sub, children }) => (
    <header className="ui-head">
        <div>
            <div className="ui-path" aria-hidden="true"><span className="ui-prompt">❯</span> {path}</div>
            <h1>{title}<span className="ui-cursor" aria-hidden="true" /></h1>
            {sub && <p>{sub}</p>}
        </div>
        {children}
    </header>
);

export default PageTitle;
