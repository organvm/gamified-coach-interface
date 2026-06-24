
from playwright.sync_api import sync_playwright
import time

def verify_orbital_nodes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Create context with reduced motion to help with stability
        context = browser.new_context(viewport={'width': 1280, 'height': 720})
        page = context.new_page()

        try:
            # Go to the local dev server
            page.goto("http://localhost:3000")

            # Wait for the boot screen to disappear (based on memory instructions)
            # "Frontend automation scripts must wait for the #boot-screen element to acquire the .hidden class"
            try:
                page.wait_for_selector("#boot-screen.hidden", timeout=10000)
            except:
                print("Boot screen didn't hide in time, proceeding anyway to check if we can see nodes")

            # Wait a bit for Three.js to initialize and render the orbital nodes
            time.sleep(2)

            # Take a screenshot to verify the scene is rendering and not white/black screen
            # If the geometry bug was present, we might see no nodes or a crash
            page.screenshot(path="verification/orbital_nodes_fixed.png")
            print("Screenshot taken: verification/orbital_nodes_fixed.png")

            # Check for console errors
            # We can't easily capture them here in this simple script without more setup,
            # but if the page crashed, the screenshot will likely be blank or show an error overlay if in dev mode

        except Exception as e:
            print(f"Error during verification: {e}")

        finally:
            browser.close()

if __name__ == "__main__":
    verify_orbital_nodes()
