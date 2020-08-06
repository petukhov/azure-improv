function sourceCode() {

    const TODAY_DATE = new Date();
    
    let prData = {};
    let tableObserver;

    const repeatStr = (str, count) => Array(count).fill().map(() => str).join(' ');

    const getIndicatorHtml = (count) => `
        <div title="Created ${count} days ago" 
             class="bolt-table-two-line-cell-item flex-row scroll-hidden"
             style="margin-top: -7px; margin-bottom: -10px;">
            <div class="secondary-text body-s text-ellipsis">
                 ${count === 0 
                    ? `<span style="font-size: 6px; color: #00fd00cc;">${repeatStr('⬤', 1)}</span>`
                    : `<span style="font-size: 6px; color: #abcde6;">${repeatStr('⬤', count)}</span>`
                }
            </div>
        </div>
    `;

    const getPrNum = el => el.getAttribute('href').match(/[0-9]+$/)[0];

    function convertToNode(strHTML) {
        const temp = document.createElement('template');
        temp.innerHTML = strHTML;
        return temp.content.firstElementChild;
    }

    function getContainersData() {
        const containers = document.querySelectorAll(
            'table.repos-pr-list > tbody > a > td:nth-of-type(3) > .bolt-table-cell-content'
        );
        const res = [];
        for (let cont of containers) {
            const prRow = cont.parentElement.parentElement;
            const prNum = getPrNum(prRow);
            res.push({
                container: cont,
                prNum,
            });
        }
        return res;
    }

    function getPrCreationDate(prNum) {
        const prCreationDateInSecs = prData[prNum].creationDate.match(/Date\(([0-9]+)\)/)[1];
        return new Date(+prCreationDateInSecs);
    }

    function getDiffDays(laterDate, earlierDate) {
        const oneDay = 24 * 60 * 60 * 1000; // hours*minutes*seconds*milliseconds
        return Math.round(Math.abs((laterDate - earlierDate) / oneDay));
    }

    function getStaticPrsData() {
        const scriptTag = document.querySelectorAll('#dataProviders')[0].childNodes[0];
        const json = JSON.parse(scriptTag.textContent);
        const staticPrs = json?.data?.["ms.vss-code-web.prs-list-data-provider"]?.pullRequests;
        return staticPrs ? staticPrs : {};
    }

    function renderIndicator(container, prNum) {
        const prCreationDate = getPrCreationDate(prNum);
        const diffDays = getDiffDays(TODAY_DATE, prCreationDate);

        container.appendChild(
            convertToNode(
                getIndicatorHtml(diffDays),
            ),
        );
    }

    function renderAllIndicators() {         
        for (let data of getContainersData()) {
            renderIndicator(data.container, data.prNum);
        }
    }

    function processPRs() {
        if (tableObserver) {
            tableObserver.disconnect();
        }
        tableObserver = new MutationObserver(function azureImprovObserve(mutationsList) {
            for (let mut of mutationsList) {
                const addedNodes = Array.from(mut.addedNodes);
                if (!addedNodes.length) {
                    continue;
                }
                const node = addedNodes[0];
                if (node.classList.contains('repos-pr-list')) {
                    renderAllIndicators();
                } else if (node.getAttribute('href')) {
                    const prNum = getPrNum(node);
                    const container = node.querySelector('.bolt-table-cell-content.flex-column');
                    renderIndicator(container, prNum);
                }
            }
        });
        const el = document.querySelector('.page-content');
        tableObserver.observe(el, {subtree: true, childList: true});
    }

    function handleData(data) {
        let prs = data?.fps?.dataProviders?.data["ms.vss-code-web.prs-list-data-provider"]?.pullRequests;
        if (prs && Object.keys(prs).length) {
            prData = { ...prs, ...prData };
            return;
        }
        prs = data?.dataProviders?.['ms.vss-code-web.prs-list-data-provider']?.pullRequests;
        if (prs && Object.keys(prs).length) {
            prData = { ...prs, ...getStaticPrsData(), ...prData};
            // at this moment we've got all the data and can process and render the indicators
            processPRs();
        } 
    }


    function shouldHandle(reqData, response) {
        // if (!location.href.includes('/pullrequests')) {
        //     return false;
        // }
        const url = reqData instanceof Response ? reqData.url : reqData;
        const contentType = response.headers.get('content-type');
        const isUrlMatching = url?.includes('Contribution/HierarchyQuery/project') || url?.includes('pullrequests?__rt=fps&__ver=2');
        const isContentTypeMatching = contentType?.includes('application/json');
        return isUrlMatching && isContentTypeMatching;
    }

    oldfetch = window.fetch;
    window.fetch = function(...args) {    
        const prom = oldfetch.call(window, ...args).then((res) => {
            if (shouldHandle(args[0], res)) {
                const clone = res.clone();
                clone.json().then(data => handleData(data));
            }
            return res;
        });
        return prom;
    }
}

const observer = new MutationObserver(() => {
    if (document.head) {

        // inject and run the script
        const scriptEl = document.createElement('script');
        scriptEl.type = 'text/javascript';
        const code = '(' + sourceCode.toString() + ')()';
        scriptEl.appendChild(document.createTextNode(code));
        document.head.appendChild(scriptEl);

        // inject the css rules
        const cssRules = `
            table.repos-pr-list.bolt-table td > .bolt-table-cell-content {
                padding-bottom: 13px;
            }
            table.repos-pr-list.bolt-table td > .bolt-table-cell-content .bolt-table-two-line-cell-item:nth-of-type(2) {
                margin-bottom: 3px;
            }
        `;
        const styleElement = document.createElement('style');
        styleElement.appendChild(document.createTextNode(cssRules));
        document.head.appendChild(styleElement);

        observer.disconnect();
    }
});

observer.observe(document.documentElement, { childList: true });