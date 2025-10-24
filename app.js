// app.js - UPDATED with iframe method to bypass CORS
const API_URL = 'https://script.google.com/macros/s/AKfycbxcJ_7kwV7IYqB7Q_eaeAHGv6l36d3R5q-QM2OmopGgKhgwYbSOpjZvSZaJOJksgskZ9Q/exec';

const state = {
    reviewer: null,
    role: null,
    articles: [],
    currentIndex: 0,
    reviewHistory: []
};

const REASONS = {
    exclude: ['not HAI', 'not perceived transparency', 'not relevant', 'duplicate', 'other'],
    include: ['Good Article', 'full text coded', 'other']
};

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

async function initializeApp() {
    await loadReviewers();
    setupEventListeners();
    
    const savedReviewer = localStorage.getItem('reviewer');
    const savedRole = localStorage.getItem('role');
    
    if (savedReviewer && savedRole) {
        document.getElementById('reviewerSelect').value = savedReviewer;
        document.querySelector(`input[name="role"][value="${savedRole}"]`).checked = true;
    }
}

function setupEventListeners() {
    document.getElementById('startReviewBtn').addEventListener('click', handleLogin);
    document.querySelectorAll('input[name="decision"]').forEach(radio => {
        radio.addEventListener('change', handleDecisionChange);
    });
    document.getElementById('saveNextBtn').addEventListener('click', handleSaveNext);
    document.getElementById('skipBtn').addEventListener('click', handleSkip);
    document.getElementById('previousBtn').addEventListener('click', handlePrevious);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('viewSummaryBtn').addEventListener('click', showSummaryPage);
    document.getElementById('viewSummaryFromComplete').addEventListener('click', showSummaryPage);
    document.getElementById('backToReviewBtn').addEventListener('click', showReviewPage);
    document.getElementById('logoutFromSummaryBtn').addEventListener('click', handleLogout);
}

// JSONP function to bypass CORS
function apiCall(endpoint, params = {}, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        // Build URL
        let url = `${API_URL}?action=${endpoint}`;
        
        // Add parameters
        const allParams = {...params};
        if (body) {
            Object.assign(allParams, body);
        }
        
        Object.keys(allParams).forEach(key => {
            url += `&${key}=${encodeURIComponent(allParams[key])}`;
        });
        
        // Generate unique callback name
        const callbackName = 'jsonp_callback_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        // Add callback parameter
        url += `&callback=${callbackName}`;
        
        console.log('Calling API via JSONP:', url);
        
        // Set timeout
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Request timeout'));
        }, 30000);
        
        // Create callback function
        window[callbackName] = function(data) {
            clearTimeout(timeout);
            cleanup();
            
            if (data.error) {
                reject(new Error(data.error));
            } else {
                resolve(data);
            }
        };
        
        // Create script tag
        const script = document.createElement('script');
        script.src = url;
        script.onerror = function() {
            clearTimeout(timeout);
            cleanup();
            reject(new Error('Failed to load script'));
        };
        
        // Cleanup function
        function cleanup() {
            delete window[callbackName];
            if (script.parentNode) {
                script.parentNode.removeChild(script);
            }
        }
        
        // Add script to page
        document.head.appendChild(script);
    });
}

// Fetch using hidden iframe
function fetchViaIframe(url) {
    return new Promise((resolve, reject) => {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.style.position = 'absolute';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        
        let timeoutId;
        
        const cleanup = () => {
            clearTimeout(timeoutId);
            if (iframe.parentNode) {
                document.body.removeChild(iframe);
            }
        };
        
        iframe.onload = function() {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                const content = iframeDoc.body.textContent || iframeDoc.body.innerText;
                
                console.log('Raw response:', content);
                
                if (!content || content.trim() === '') {
                    cleanup();
                    reject(new Error('Empty response from server'));
                    return;
                }
                
                const data = JSON.parse(content);
                cleanup();
                
                if (data.error) {
                    reject(new Error(data.error));
                } else {
                    resolve(data);
                }
            } catch (error) {
                cleanup();
                console.error('Parse error:', error);
                reject(new Error('Failed to parse response: ' + error.message));
            }
        };
        
        iframe.onerror = function(e) {
            cleanup();
            console.error('Iframe error:', e);
            reject(new Error('Failed to load data from server'));
        };
        
        // Set timeout
        timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error('Request timeout'));
        }, 30000); // 30 second timeout
        
        iframe.src = url;
        document.body.appendChild(iframe);
    });
}

async function loadReviewers() {
    try {
        console.log('Loading reviewers...');
        const data = await apiCall('getReviewers');
        console.log('Reviewers loaded:', data);
        
        const select = document.getElementById('reviewerSelect');
        
        select.innerHTML = '<option value="">-- Select your name --</option>';
        data.reviewers.forEach(reviewer => {
            const option = document.createElement('option');
            option.value = reviewer;
            option.textContent = reviewer;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load reviewers:', error);
        showError('loginError', 'Failed to load reviewers: ' + error.message);
    }
}

async function handleLogin() {
    const reviewer = document.getElementById('reviewerSelect').value;
    const role = document.querySelector('input[name="role"]:checked').value;
    
    if (!reviewer) {
        showError('loginError', 'Please select your name');
        return;
    }
    
    state.reviewer = reviewer;
    state.role = role;
    
    localStorage.setItem('reviewer', reviewer);
    localStorage.setItem('role', role);
    
    document.getElementById('reviewerInfo').textContent = `${reviewer} (${role})`;
    document.getElementById('summaryReviewerInfo').textContent = `${reviewer} (${role})`;
    
    showPage('reviewPage');
    await loadArticles();
}

async function loadArticles() {
    try {
        const data = await apiCall('getArticles', {
            reviewer: state.reviewer,
            role: state.role
        });
        
        state.articles = data.articles;
        state.currentIndex = 0;
        
        if (state.articles.length === 0) {
            showNoArticles();
        } else {
            displayCurrentArticle();
        }
    } catch (error) {
        showError('decisionError', 'Failed to load articles: ' + error.message);
    }
}

function displayCurrentArticle() {
    if (state.currentIndex >= state.articles.length) {
        showNoArticles();
        return;
    }
    
    const article = state.articles[state.currentIndex];
    
    document.getElementById('loadingArticle').style.display = 'none';
    document.getElementById('noArticles').style.display = 'none';
    document.getElementById('articleContent').style.display = 'block';
    
    const progress = (state.currentIndex / state.articles.length) * 100;
    document.getElementById('progressFill').style.width = `${progress}%`;
    document.getElementById('progressText').textContent = `Article ${state.currentIndex + 1} of ${state.articles.length}`;
    
    document.getElementById('articleTitle').textContent = article.title;
    document.getElementById('articleAuthors').textContent = article.author || 'N/A';
    document.getElementById('articleYear').textContent = article.year || 'N/A';
    document.getElementById('articleSource').textContent = article.source || 'N/A';
    document.getElementById('articlePublication').textContent = article.publicationTitle || 'N/A';
    document.getElementById('articleType').textContent = article.publicationType || 'N/A';
    document.getElementById('articleDOI').textContent = article.doi || 'N/A';
    document.getElementById('articleAbstract').textContent = article.abstract || 'No abstract available';
    
    const linkBtn = document.getElementById('articleLink');
    if (article.url) {
        linkBtn.href = article.url;
        linkBtn.style.display = 'inline-flex';
    } else {
        linkBtn.style.display = 'none';
    }
    
    document.querySelectorAll('input[name="decision"]').forEach(radio => radio.checked = false);
    document.getElementById('reasonSection').style.display = 'none';
    document.getElementById('additionalNotes').value = '';
    document.getElementById('previousBtn').disabled = state.reviewHistory.length === 0;
}

function handleDecisionChange(event) {
    const decision = event.target.value;
    const reasonSection = document.getElementById('reasonSection');
    const reasonSelect = document.getElementById('reasonSelect');
    
    reasonSection.style.display = 'block';
    
    const reasons = decision === '1' ? REASONS.include : REASONS.exclude;
    reasonSelect.innerHTML = '<option value="">-- Select reason --</option>';
    
    reasons.forEach(reason => {
        const option = document.createElement('option');
        option.value = reason;
        option.textContent = reason;
        reasonSelect.appendChild(option);
    });
}

async function handleSaveNext() {
    const decision = document.querySelector('input[name="decision"]:checked');
    const reason = document.getElementById('reasonSelect').value;
    const additionalNotes = document.getElementById('additionalNotes').value.trim();
    
    if (!decision) {
        showError('decisionError', 'Please select a decision');
        return;
    }
    
    let finalNote = reason || '';
    if (additionalNotes) {
        finalNote = finalNote ? `${finalNote}; ${additionalNotes}` : additionalNotes;
    }
    
    const saveBtn = document.getElementById('saveNextBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    
    try {
        const currentArticle = state.articles[state.currentIndex];
        await apiCall('submitDecision', {}, 'POST', {
            rowIndex: currentArticle.rowIndex,
            reviewer: state.reviewer,
            role: state.role,
            decision: parseInt(decision.value),
            note: finalNote
        });
        
        state.reviewHistory.push(state.currentIndex);
        state.articles.splice(state.currentIndex, 1);
        
        if (state.articles.length === 0) {
            showNoArticles();
        } else {
            if (state.currentIndex >= state.articles.length) {
                state.currentIndex = state.articles.length - 1;
            }
            displayCurrentArticle();
        }
    } catch (error) {
        showError('decisionError', 'Failed to save decision: ' + error.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save & Next →';
    }
}

function handleSkip() {
    if (state.currentIndex < state.articles.length - 1) {
        state.currentIndex++;
    } else {
        state.currentIndex = 0;
    }
    displayCurrentArticle();
}

function handlePrevious() {
    if (state.reviewHistory.length > 0) {
        state.currentIndex = state.reviewHistory.pop();
        displayCurrentArticle();
    }
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
}

function showError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    setTimeout(() => errorElement.style.display = 'none', 5000);
}

function showNoArticles() {
    document.getElementById('loadingArticle').style.display = 'none';
    document.getElementById('articleContent').style.display = 'none';
    document.getElementById('noArticles').style.display = 'block';
    document.getElementById('progressFill').style.width = '100%';
    document.getElementById('progressText').textContent = 'All articles reviewed!';
}

function showReviewPage() {
    showPage('reviewPage');
    if (state.articles.length > 0) {
        displayCurrentArticle();
    }
}

async function showSummaryPage() {
    showPage('summaryPage');
    await loadSummary();
}

async function loadSummary() {
    try {
        const data = await apiCall('getSummary', {
            reviewer: state.reviewer,
            role: state.role
        });
        
        const statsGrid = document.getElementById('summaryStats');
        statsGrid.innerHTML = `
            <div class="stat-card"><span class="stat-value">${data.stats.total}</span><span class="stat-label">Total Assigned</span></div>
            <div class="stat-card"><span class="stat-value">${data.stats.completed}</span><span class="stat-label">Reviewed</span></div>
            <div class="stat-card"><span class="stat-value">${data.stats.remaining}</span><span class="stat-label">Remaining</span></div>
            <div class="stat-card"><span class="stat-value">${data.stats.included}</span><span class="stat-label">Included</span></div>
            <div class="stat-card"><span class="stat-value">${data.stats.excluded}</span><span class="stat-label">Excluded</span></div>
        `;
        
        const reviewedList = document.getElementById('reviewedList');
        if (data.reviewed.length === 0) {
            reviewedList.innerHTML = '<p style="color: var(--text-secondary); padding: 1rem;">No articles reviewed yet.</p>';
        } else {
            reviewedList.innerHTML = data.reviewed.map(article => `
                <div class="article-item">
                    <div class="article-item-title">${article.title}</div>
                    <div class="article-item-meta">
                        <span>${article.author || 'Unknown Author'}</span>
                        <span>${article.year || 'N/A'}</span>
                    </div>
                    <span class="article-item-decision ${article.decision === 1 ? 'included' : 'excluded'}">
                        ${article.decision === 1 ? 'Included' : 'Excluded'}
                    </span>
                    ${article.note ? `<div style="margin-top: 0.5rem; font-size: 0.875rem; color: var(--text-secondary);">${article.note}</div>` : ''}
                </div>
            `).join('');
        }
        
        const pendingList = document.getElementById('pendingList');
        const pendingCard = document.getElementById('pendingCard');
        if (data.pending.length === 0) {
            pendingCard.style.display = 'none';
        } else {
            pendingCard.style.display = 'block';
            pendingList.innerHTML = data.pending.map(article => `
                <div class="article-item">
                    <div class="article-item-title">${article.title}</div>
                    <div class="article-item-meta">
                        <span>${article.author || 'Unknown Author'}</span>
                        <span>${article.year || 'N/A'}</span>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Failed to load summary:', error);
        alert('Failed to load summary: ' + error.message);
    }
}

function handleLogout() {
    localStorage.removeItem('reviewer');
    localStorage.removeItem('role');
    
    state.reviewer = null;
    state.role = null;
    state.articles = [];
    state.currentIndex = 0;
    state.reviewHistory = [];
    
    showPage('loginPage');
}
