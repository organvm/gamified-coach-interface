
from playwright.sync_api import sync_playwright

def verify_orbital_nodes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the app (assuming port 3000 from memory)
        # Wait for the server to be ready might be needed in real life, but here we just try
        try:
            page.goto('http://localhost:3000/legion-v3.html')

            # Wait for canvas to be present (Three.js renders to canvas)
            page.wait_for_selector('canvas', timeout=10000)

            # Wait a bit for animation to start
            page.wait_for_timeout(2000)

            # Take screenshot
            page.screenshot(path='verification/orbital_nodes.png')
            print('Screenshot taken successfully')
        except Exception as e:
            print(f'Error: {e}')
        finally:
            browser.close()

if __name__ == '__main__':
    verify_orbital_nodes()
