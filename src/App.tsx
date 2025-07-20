import './App.css'
import { useState, useRef, useEffect } from 'react'
import * as uuid from 'uuid';
import placeholderImg from './asset/placeholder.jpg';

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [image, setImage] = useState<File | null>(null);
  const [uploadResultMessage, setUploadResultMessage] = useState('Please upload an image to authenticate.');
  const [imgSrc, setImgSrc] = useState(placeholderImg);
  const [isAuth, setIsAuth] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  
  // Initialize camera when cameraActive becomes true
  useEffect(() => {
    let stream: MediaStream | null = null;
    
    async function setupCamera() {
      if (cameraActive && videoRef.current) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "user" },
            audio: false 
          });
          
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (err) {
          console.error("Error accessing camera:", err);
          setCameraActive(false);
        }
      }
    }
    
    setupCamera();
    
    // Cleanup function to stop camera when component unmounts or cameraActive changes
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraActive]);
  
  // Function to capture photo from camera
  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // Reset previous image and authentication state
      setImgSrc(placeholderImg);
      setIsAuth(false);
      setUploadResultMessage('Please authenticate with your new photo.');
      
      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Store the aspect ratio for consistent display
      const aspectRatio = video.videoWidth / video.videoHeight;
      
      // Draw current video frame to canvas
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert canvas to blob/file
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], "camera-photo.jpeg", { type: "image/jpeg" });
            setImage(file);
            
            // Create object URL and store with data attribute for aspect ratio
            const imageUrl = URL.createObjectURL(file);
            setImgSrc(imageUrl);
            
            // Store aspect ratio as a data attribute on the image element
            const imgElement = document.querySelector('.preview-image') as HTMLImageElement;
            if (imgElement) {
              imgElement.dataset.aspectRatio = aspectRatio.toString();
            }
            
            setCameraActive(false); // Turn off camera after taking photo
          }
        }, 'image/jpeg', 0.95);
      }
    }
  };
  
  // Toggle camera on/off
  const toggleCamera = () => {
    // Reset image and message when turning camera on
    if (!cameraActive) {
      setImgSrc(placeholderImg);
      setUploadResultMessage('Please upload an image to authenticate.');
      setIsAuth(false);
    }
    setCameraActive(!cameraActive);
  };
  
  const sendImage = async (e: React.MouseEvent) => {
    e.preventDefault();

    if (!image) {
      setUploadResultMessage("Please take a photo first.");
      return;
    }

    const userImageName = uuid.v4();
    // Create object URL for preview
    const imageUrl = URL.createObjectURL(image);
    setImgSrc(imageUrl);
    
    try {
      setUploadResultMessage("Uploading image...");
      const apiUrl = import.meta.env.VITE_API_GATEWAY_URL;
      const bucketPath = import.meta.env.VITE_S3_BUCKET_PATH;
      const uploadResponse = await fetch(`${apiUrl}/${bucketPath}/${userImageName}.jpeg`, {
        method: 'PUT',
        body: image,
        headers: {
          'Content-Type': 'image/jpeg'
        },
      });
      
      if (!uploadResponse.ok) {
        throw new Error(`Upload failed with status: ${uploadResponse.status}`);
      } else {
        console.log("Image uploaded at S3")
      }
      
      const response = await authenticate(userImageName);
      if (response && response.Message === "Success") {
        setIsAuth(true);
        setUploadResultMessage(`Hi! ${response['firstName']} ${response['lastName']}, you are authenticated successfully!`);
      } else if (response && response.Message === "NotFound") {
        setIsAuth(false);
        setUploadResultMessage("Person not found in the system. Please register first.");
      } else {
        setIsAuth(false);
        setUploadResultMessage("Sorry, we could not authenticate you. Please try again.");
      }
    } catch (error) {
      setIsAuth(false);
      console.error("Error uploading image:", error);
      setUploadResultMessage("An error occurred. Please try again.")
    }

  }

  async function authenticate(userImageName: string) {
    try {
      const apiUrl = import.meta.env.VITE_API_GATEWAY_URL;
      const requestURL = `${apiUrl}/attendee?` + new URLSearchParams({
        objectKey: `${userImageName}.jpeg`
      });
      const response = await fetch(requestURL, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
      });
      
      if (response.status === 403) {
        console.log("Person not found in the system");
        return { Message: "NotFound", error: "Person not found in the system" };
      } else if (!response.ok) {
        throw new Error(`Authentication failed with status: ${response.status}`);
      } else {
        console.log("Image authenticated");
      }
      
      return await response.json();
    } catch (error) {
      console.error("Error authenticating:", error);
      return null;
    }
  }

  return (
    <>
      <div className='App'>
        <h2>Facial Recognition Attendance System</h2>
        
        {/* Camera toggle button */}
        <button type="button" onClick={toggleCamera}>
          {cameraActive ? "Turn Off Camera" : "Use Camera"}
        </button>
        
        {/* Camera view */}
        {cameraActive && (
          <div className="camera-container">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              style={{ width: '100%', maxWidth: '500px' }} 
            />
            <button type="button" onClick={capturePhoto}>Take Photo</button>
          </div>
        )}
        
        {/* Hidden canvas for processing camera image */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        
        {/* Authentication button */}
        <div className="auth-button-container">
          <button 
            onClick={sendImage} 
            disabled={!image || cameraActive}
          >
            Authenticate
          </button>
        </div>
        
        <div className={isAuth ? "success" : "failure"}>{uploadResultMessage}</div>
        <img 
          src={imgSrc} 
          alt='User' 
          className="preview-image" 
          style={{ 
            height: '250px', 
            width: 'auto', 
            maxWidth: '100%', 
            objectFit: 'contain' 
          }}
        />
      </div>
    </>
  )
}

export default App
