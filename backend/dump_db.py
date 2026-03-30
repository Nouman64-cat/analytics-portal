import os
import subprocess
from datetime import datetime
from dotenv import load_dotenv

def take_dump():
    # Load environment variables to try and get DATABASE_URL natively
    load_dotenv()
    
    # Use explicit URL provided as fallback
    fallback_url = "postgresql://neondb_owner:npg_yN1geCkYDuj3@ep-lingering-scene-a4ngk6qi-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"
    db_url = os.environ.get("DATABASE_URL", fallback_url)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = f"database_dump_{timestamp}.sql"
    
    print(f"Starting database dump to {output_file}...")
    
    try:
        # Run pg_dump command 
        # -F p : plain text SQL (default)
        # --clean : output commands to clean (drop) database objects prior to outputting the commands for creating them
        # --no-owner : skip restoration of object ownership
        command = [
            "pg_dump", 
            db_url,
            "-F", "p",
            "--clean",
            "--no-owner",
            "-f", output_file
        ]
        
        subprocess.run(command, check=True)
        print(f"✅ Database dump successfully saved to {output_file}")
        
    except FileNotFoundError:
        print("❌ Error: pg_dump utility not found.")
        print("Please install the PostgreSQL client tools on your system to run this script.")
        print("If you are on Ubuntu/Debian, run:")
        print("   sudo apt update && sudo apt install -y postgresql-client")
    except subprocess.CalledProcessError as e:
        print(f"❌ Error taking database dump: Process exited with code {e.returncode}")
    except Exception as e:
        print(f"❌ Unexpected error occurred: {str(e)}")

if __name__ == "__main__":
    take_dump()
