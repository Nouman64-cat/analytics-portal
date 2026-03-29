import os
import re

directory = 'app'
components_dir = 'components'

replacements = {
    r'bg-\[\#12141c\]': 'bg-white dark:bg-[#12141c]',
    r'bg-\[\#14161f\]': 'bg-white dark:bg-[#14161f]',
    r'bg-\[\#0c0e14\]': 'bg-slate-50 dark:bg-[#0c0e14]', 
    r'(?<!-)text-white': 'text-slate-900 dark:text-white', # Avoid ring-offset-white etc.
    r'border-white/\[0\.06\]': 'border-slate-200 dark:border-white/[0.06]',
    r'border-white/\[0\.04\]': 'border-slate-200 dark:border-white/[0.04]',
    r'border-white/\[0\.08\]': 'border-slate-200 dark:border-white/[0.08]',
    r'border-white/\[0\.1\]': 'border-slate-300 dark:border-white/[0.1]',
    r'hover:bg-white/\[0\.04\]': 'hover:bg-slate-100 dark:hover:bg-white/[0.04]',
    r'hover:bg-white/\[0\.06\]': 'hover:bg-slate-200 dark:hover:bg-white/[0.06]',
    r'hover:bg-white/\[0\.1\]': 'hover:bg-slate-300 dark:hover:bg-white/[0.1]',
    r'bg-white/\[0\.02\]': 'bg-slate-100 dark:bg-white/[0.02]',
    r'bg-white/\[0\.03\]': 'bg-white dark:bg-white/[0.03]',
    r'bg-white/\[0\.04\]': 'bg-slate-100 dark:bg-white/[0.04]',
    r'text-slate-300': 'text-slate-700 dark:text-slate-300',
    r'text-slate-400': 'text-slate-600 dark:text-slate-400',
    r'text-slate-500': 'text-slate-500 dark:text-slate-500',
}

def process_dir(target_dir):
    if not os.path.exists(target_dir): return
    for root, dirs, files in os.walk(target_dir):
        for file in files:
            if file.endswith('.tsx'):
                path = os.path.join(root, file)
                with open(path, 'r') as f:
                    content = f.read()
                
                original = content
                for pattern, replacement in replacements.items():
                    # Only match if not preceded by `dark:`
                    content = re.sub(r'(?<!dark:)' + pattern, replacement, content)
                
                if content != original:
                    with open(path, 'w') as f:
                        f.write(content)
                    print(f"Updated {path}")

process_dir(directory)
process_dir(components_dir)
