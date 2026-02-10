import os
import sys
from flask import Flask, render_template, request, send_file, flash, redirect, url_for
import yt_dlp

app = Flask(__name__)
app.secret_key = 'esencial-downloader'

# Ensure downloads directory exists
DOWNLOAD_FOLDER = os.path.join(os.getcwd(), 'downloads')
if not os.path.exists(DOWNLOAD_FOLDER):
    os.makedirs(DOWNLOAD_FOLDER)

def get_ffmpeg_path():
    import shutil
    # First check system PATH
    path = shutil.which('ffmpeg')
    if path:
        return path
    
    # Check common Homebrew paths on macOS
    common_paths = [
        '/opt/homebrew/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
        '/usr/bin/ffmpeg'
    ]
    
    for p in common_paths:
        if os.path.exists(p) and os.access(p, os.X_OK):
            return p
            
    return None

@app.route('/')
def index():
    ffmpeg_path = get_ffmpeg_path()
    ffmpeg_available = ffmpeg_path is not None
    return render_template('index.html', ffmpeg_available=ffmpeg_available)

@app.route('/download', methods=['POST'])
def download():
    url = request.form.get('url')
    format_type = request.form.get('format') # 'video' or 'audio'

    if not url:
        flash('Por favor ingresa una URL válida')
        return redirect(url_for('index'))

    try:
        ffmpeg_path = get_ffmpeg_path()
        ffmpeg_location = os.path.dirname(ffmpeg_path) if ffmpeg_path else None
        
        # Common options
        ydl_opts = {
            'outtmpl': os.path.join(DOWNLOAD_FOLDER, '%(title)s.%(ext)s'),
            'quiet': False, # Changed to False to see progress in terminal
            'no_warnings': False,
            'nocheckcertificate': True, # Fix for macOS SSL errors
        }
        
        # Explicitly tell yt-dlp where ffmpeg is if we found it
        if ffmpeg_location:
            ydl_opts['ffmpeg_location'] = ffmpeg_location

        if format_type == 'audio':
            ydl_opts.update({
                'format': 'bestaudio/best',
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }],
            })
        else:
            # Video download
            # If ffmpeg is available, we can merge best video+audio
            # If not, we download 'best' which is a single file (usually max 720p)
            if ffmpeg_path:
                ydl_opts.update({
                    'format': 'bestvideo+bestaudio/best',
                    'merge_output_format': 'mp4',
                })
            else:
                ydl_opts.update({
                    'format': 'best[ext=mp4]',
                })

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            
            # Adjust filename for audio conversion
            if format_type == 'audio':
                 filename_base = os.path.splitext(filename)[0]
                 filename = f"{filename_base}.mp3"
            elif ffmpeg_path and format_type == 'video':
                # If merged, it forces mp4
                filename_base = os.path.splitext(filename)[0]
                filename = f"{filename_base}.mp4"

        return send_file(filename, as_attachment=True)

    except Exception as e:
        flash(f'Error al descargar: {str(e)}')
        return redirect(url_for('index'))

if __name__ == '__main__':
    # Try a few ports
    ffmpeg_path = get_ffmpeg_path()
    if not ffmpeg_path:
        print("ADVERTENCIA: FFmpeg no encontrado. La conversión a MP3 fallará y los videos pueden estar limitados a 720p.")
    else:
        print(f"FFmpeg detectado en: {ffmpeg_path}")
    
    port = 5050
    print(f"App iniciada en http://127.0.0.1:{port}")
    app.run(debug=True, port=port)
